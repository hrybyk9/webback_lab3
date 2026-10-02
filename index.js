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

program.parse();