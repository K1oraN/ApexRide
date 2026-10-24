// Generate portable attribution from pnpm's installed dependency inventory.
import {
  readFile,
  writeFile,
  readdir,
  mkdir,
  copyFile,
} from 'node:fs/promises';
import { resolve, join, basename } from 'node:path';
const raw = await readFile('.local/parte23-licenses.json');
const source = JSON.parse(
  raw.subarray(0, 2).equals(Buffer.from([255, 254]))
    ? raw.toString('utf16le').replace(/^\uFEFF/, '')
    : raw.toString('utf8').replace(/^\uFEFF/, ''),
);
const dependencies = Object.values(source)
  .flat()
  .map(({ name, versions, license, author, homepage }) => ({
    name,
    versions,
    license,
    ...(author ? { author } : {}),
    ...(homepage ? { homepage } : {}),
  }))
  .sort((a, b) => a.name.localeCompare(b.name));
await mkdir('docs/licenses/third-party', { recursive: true });
await writeFile(
  'docs/licenses/dependencies.json',
  JSON.stringify(
    {
      generatedFrom: 'pnpm licenses list --json (lockfile instalado)',
      scope:
        'Dependências de desenvolvimento e execução; não inclui servidor PostgreSQL/PostGIS ou dados externos',
      dependencies,
    },
    null,
    2,
  ) + '\n',
);
let notices =
  '# Avisos e licenças de terceiros\n\nA licença proprietária do Apex Ride aplica-se somente ao material autoral. As dependências, fontes, ícones, dados e serviços externos mantêm suas respectivas licenças. Este inventário foi extraído das dependências instaladas pelo lockfile; não substitui os arquivos LICENSE/NOTICE originais.\n\nConsulte [inventário por pacote e versão](docs/licenses/dependencies.json), [licença da fonte](docs/licenses/RobotoCondensed-OFL.txt) e [licença MapLibre](docs/licenses/MapLibre-GL-JS-LICENSE.txt).\n\nOs avisos abaixo foram copiados dos pacotes instalados, sem alterar seus termos. Conserve-os em distribuições que incluam esses componentes.\n\n';
// Copy original license and notice texts for all inventoried packages, including bundled transitives.
for (const entry of Object.values(source)
  .flat()
  .sort((a, b) => a.name.localeCompare(b.name))) {
  const directory = entry.paths?.[0];
  if (!directory) continue;
  const files = (await readdir(directory)).filter((name) =>
    /^(licen[sc]e|copying|notice)(\.|-|$)/i.test(name),
  );
  for (const file of files) {
    const name = `${entry.name.replaceAll('@', '').replaceAll('/', '__')}--${entry.versions[0]}--${basename(file)}`;
    await copyFile(
      join(directory, file),
      resolve('docs/licenses/third-party', name),
    );
    notices += `- ${entry.name} ${entry.versions.join(', ')} — ${entry.license}: [${file}](docs/licenses/third-party/${encodeURIComponent(name)})\n`;
  }
}
notices +=
  '\n## Recursos e serviços externos\n\n- Fotografias e terreno ilustrativos: procedência e prompts em [visual-assets.json](docs/visual-assets.json). Não retratam atividade real da comunidade; não há garantia de exclusividade ou titularidade de direitos de terceiros representados.\n- OpenFreeMap/estilo e dados cartográficos: atribuições fornecidas pelo estilo MapLibre devem permanecer visíveis. A licença do cliente MapLibre não licencia os dados cartográficos nem contrata o serviço.\n- Limites municipais: snapshot IBGE em `database/reference/alagoas-regions.json`; consulte procedência na documentação de trajetos semelhantes antes de redistribuir dados derivados.\n- PostgreSQL/PostGIS e imagem de contêiner não integram a licença autoral. Seus avisos e obrigações próprios devem ser preservados caso sejam redistribuídos.\n- Conteúdo enviado por usuários continua sujeito aos direitos dos respectivos titulares e às políticas a serem aprovadas.\n\nEste arquivo não concede direitos sobre a marca Apex Ride nem substitui a revisão jurídica necessária antes da distribuição comercial.\n';
await writeFile('THIRD_PARTY_NOTICES.md', notices);
console.log(
  `${dependencies.length} pacotes inventariados; avisos originais preservados.`,
);
