/** Apex Ride Etapa 06: registra exclusão permanente preservando o resto da API.
 * Este script só faz duas substituições exatas, de maneira idempotente e com backup.
 * Pré-requisito: copiar apps/ do ZIP antes de executar.
 */
import { existsSync, readFileSync, writeFileSync, copyFileSync } from 'node:fs';
import { resolve } from 'node:path';

const target = resolve(process.cwd(), 'apps/api/src/modules/motorcycles/routes.ts');
const moduleFile = resolve(process.cwd(), 'apps/api/src/modules/motorcycles/permanent-delete.ts');
if (!existsSync(target) || !existsSync(moduleFile)) {
  throw new Error('Abra o PowerShell em D:\\Projetos\\ApexRide e copie a pasta apps do ZIP antes de instalar.');
}
let current = readFileSync(target, 'utf8');
const importLine = "import { registerGarageRecords } from './records.js';";
const registerLine = '  registerGarageRecords(app, { db, identify, owner, own, transaction });';
const injectedImport = "import { registerPermanentMotorcycleDeletion } from './permanent-delete.js';";
const injectedCall = '  registerPermanentMotorcycleDeletion(app, { identify, owner, own, transaction, queue, clean });';
const matches = (source, search) => source.split(search).length - 1;
if (current.includes(injectedImport) && current.includes(injectedCall)) {
  console.log('Etapa 06: endpoint já registrado. Nenhuma alteração necessária.');
  process.exit(0);
}
if (current.includes(injectedImport) || current.includes(injectedCall)) {
  throw new Error('Instalação parcial detectada em routes.ts. Não sobrescrevi o arquivo. Confira as alterações.');
}
if (matches(current, importLine) !== 1 || matches(current, registerLine) !== 1) {
  throw new Error('O routes.ts atual não corresponde aos pontos esperados. Instalação interrompida sem mudanças.');
}
const changed = current.replace(importLine, `${importLine}\n${injectedImport}`)
  .replace(registerLine, `${registerLine}\n${injectedCall}`);
const backup = `${target}.before-etapa-06-${new Date().toISOString().replace(/[:.]/g, '-')}.bak`;
copyFileSync(target, backup);
writeFileSync(target, changed, 'utf8');
console.log('Etapa 06 aplicada: registro do endpoint DELETE /motorcycles/:id/permanent.');
console.log(`Backup: ${backup}`);
