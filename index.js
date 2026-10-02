import { Command } from 'commander';
import { readFileSync } from 'node:fs';

function translateError(message) {
  const text = message.trim();

  if (!text.startsWith('error:')) {
    return text + '\n';
  }

  let match = text.match(/missing required argument '(.+)'/);
  if (match) {
    return `Помилка: пропущено обов'язковий аргумент <${match[1]}>.\n`;
  }

  match = text.match(/unknown option '(.+)'/);
  if (match) {
    return `Помилка: невідома опція "${match[1]}".\n`;
  }

  match = text.match(/unknown command '(.+)'/);
  if (match) {
    return `Помилка: невідома команда "${match[1]}".\n`;
  }

  match = text.match(/option '(.+)' argument missing/);
  if (match) {
    return `Помилка: для опції "${match[1]}" не вказано значення.\n`;
  }

  if (text.includes('too many arguments')) {
    return 'Помилка: передано забагато аргументів.\n';
  }

  return `Помилка виклику: ${text}\n`;
}

const program = new Command();

program.configureOutput({
  outputError: (message, write) => write(translateError(message)),
});
program.showHelpAfterError('(для довідки додайте --help)');

program
  .name('orders')
  .description('Програма для перегляду замовлень інтернет-магазину з JSON-файлу')
  .version('1.0.0', '-v, --version', 'показати версію програми')
  .helpOption('-h, --help', 'показати довідку')
  .option('-f, --file <path>', 'шлях до JSON-файлу із замовленнями', 'data.json');


function loadOrders() {
  const path = program.opts().file;

  let text;
  try {
    text = readFileSync(path, 'utf-8');
  } catch (err) {
    if (err.code === 'ENOENT') {
      program.error(`Помилка: файл "${path}" не знайдено.`);
    }
    program.error(`Помилка: не вдалося прочитати файл "${path}" (${err.code}).`);
  }

  let data;
  try {
    data = JSON.parse(text);
  } catch {
    program.error(`Помилка: файл "${path}" містить некоректний JSON.`);
  }

  if (!Array.isArray(data)) {
    program.error('Помилка: у файлі очікується масив замовлень.');
  }

  return data;
}




function parsePositiveInt(value, name) {
  if (!/^\d+$/.test(value) || Number(value) < 1) {
    program.error(`Помилка: ${name} має бути цілим числом не менше 1, отримано "${value}".`);
  }
  return Number(value);
}


function getOrder(orders, numberText) {
  const number = parsePositiveInt(numberText, 'номер замовлення');
  if (number > orders.length) {
    program.error(`Помилка: замовлення №${number} не існує. Усього замовлень: ${orders.length}.`);
  }
  return orders[number - 1];
}


function orderTotal(order) {
  let total = 0;
  for (const item of order.items ?? []) {
    total += item.price * item.quantity;
  }
  return Math.round(total * 100) / 100;
}

function getByPath(obj, path) {
  let current = obj;
  for (const key of path.split('.')) {
    if (current === null || typeof current !== 'object' || !Object.hasOwn(current, key)) {
      return { found: false };
    }
    current = current[key];
  }
  return { found: true, value: current };
}



program
  .command('list')
  .description('показати стислий список замовлень')
  .option('-l, --limit <n>', 'максимальна кількість замовлень у списку')
  .action((options) => {
    const orders = loadOrders();

    let count = orders.length;
    if (options.limit !== undefined) {
      count = Math.min(parsePositiveInt(options.limit, 'значення --limit'), orders.length);
    }

    for (let i = 0; i < count; i++) {
      const order = orders[i];
      const paid = order.isPaid ? 'оплачено' : 'не оплачено';
      console.log(
        `№${i + 1} | ${order.status} | ${order.shippingAddress?.city} | ${paid} | ${orderTotal(order).toFixed(2)} $`
      );
    }
  });

program
  .command('show')
  .description('показати одне замовлення цілком')
  .argument('<number>', 'номер замовлення (позиція у файлі, починаючи з 1)')
  .action((number) => {
    const orders = loadOrders();
    const order = getOrder(orders, number);
    console.log(JSON.stringify(order, null, 2));
  });

program
  .command('field')
  .description('показати значення окремого поля замовлення, зокрема вкладеного')
  .argument('<number>', 'номер замовлення (починаючи з 1)')
  .argument('<path>', 'шлях до поля через крапку, напр. shippingAddress.city або items.0.name')
  .action((number, path) => {
    const orders = loadOrders();
    const order = getOrder(orders, number);

    const result = getByPath(order, path);
    if (!result.found) {
      program.error(`Помилка: поле "${path}" у замовленні №${number} не знайдено.`);
    }

    const value = result.value;
    if (value !== null && typeof value === 'object') {
      console.log(JSON.stringify(value, null, 2));
    } else {
      console.log(String(value)); 
    }
  });



const SORT_FIELDS = ['name', 'price', 'quantity', 'sum'];

program
  .command('items')
  .description('показати позиції замовлення із сумою за кожну')
  .argument('<number>', 'номер замовлення (починаючи з 1)')
  .option('-s, --sort <by>', 'сортувати за полем: name, price, quantity або sum')
  .option('-d, --desc', 'сортувати за спаданням (потребує --sort)')
  .action((number, options) => {
    const orders = loadOrders();
    const order = getOrder(orders, number);

    if (options.desc && options.sort === undefined) {
      program.error('Помилка: прапорець --desc можна використовувати лише разом з --sort.');
    }

    
    const rows = (order.items ?? []).map((item) => ({
      name: item.name,
      price: item.price,
      quantity: item.quantity,
      sum: Math.round(item.price * item.quantity * 100) / 100,
    }));

    if (options.sort !== undefined) {
      if (!SORT_FIELDS.includes(options.sort)) {
        program.error(
          `Помилка: невідоме поле сортування "${options.sort}". Допустимо: ${SORT_FIELDS.join(', ')}.`
        );
      }

      rows.sort((a, b) => {
        if (options.sort === 'name') {
          return a.name.localeCompare(b.name, 'uk');
        }
        return a[options.sort] - b[options.sort];
      });

      if (options.desc) {
        rows.reverse();
      }
    }

    rows.forEach((row, i) => {
      console.log(
        `${i + 1}. ${row.name} — ${row.price.toFixed(2)} $ × ${row.quantity} = ${row.sum.toFixed(2)} $`
      );
    });
  });

program
  .command('total')
  .description('показати загальну суму замовлення')
  .argument('<number>', 'номер замовлення (починаючи з 1)')
  .action((number) => {
    const orders = loadOrders();
    const order = getOrder(orders, number);
    console.log(`Загальна сума замовлення №${number}: ${orderTotal(order).toFixed(2)} $`);
  });

program
  .command('summary')
  .description('показати зведення про доставку й оплату замовлення')
  .argument('<number>', 'номер замовлення (починаючи з 1)')
  .action((number) => {
    const orders = loadOrders();
    const order = getOrder(orders, number);
    const address = order.shippingAddress;

    console.log(`Замовлення №${number}`);
    console.log(`Статус: ${order.status}`);
    console.log(`Адреса доставки: ${address.city}, ${address.street}, ${address.postalCode}`);
    console.log(`Спосіб оплати: ${order.paymentMethod}`);
    console.log(`Оплата: ${order.isPaid ? 'оплачено' : 'не оплачено'}`);
  });

program.parse();