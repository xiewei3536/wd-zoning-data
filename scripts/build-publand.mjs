// 公有土地縣市包重建(dep-free,供 GitHub Actions 月更)
// 內政部 dataset 34315:索引 CSV → 22 縣市 XML zip → out/<CODE>.json
// 用法:node scripts/build-publand.mjs   (輸出至 ./out)
import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';

const WORK = process.env.WORK_DIR || path.join(process.cwd(), 'work');
const OUT = path.join(process.cwd(), 'out');
fs.mkdirSync(WORK, { recursive: true });
fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(OUT, { recursive: true });

const download = (url, dest) => {
    if (fs.existsSync(dest) && fs.statSync(dest).size > 2000) return;
    execSync(`curl -sSL --retry 3 -m 1200 -o "${dest}" "${url}"`, { stdio: 'pipe' });
};

const idxCsv = path.join(WORK, 'publand.csv');
download('https://opdadm.moi.gov.tw/api/v1/no-auth/resource/api/dataset/7EFCAF0A-F102-4E85-9B79-6B4F4A70B0A7/resource/A7AAC2AC-B07B-43FE-83B2-B22015D81BDD/download', idxCsv);
const list = fs.readFileSync(idxCsv, 'utf8').replace(/^﻿/, '').split('\n').slice(1).filter(Boolean)
    .map((l) => l.split(','))
    .map((r) => ({ county: r[1], code: (r[4] || '').match(/fileName=([A-Z])/)?.[1], url: (r[4] || '').trim() }))
    .filter((x) => x.code && x.url);
console.log('縣市包:', list.length);

let total = 0;
for (const it of list) {
    const zip = path.join(WORK, `${it.code}.zip`);
    download(it.url, zip);
    const dir = path.join(WORK, `x_${it.code}`);
    if (!fs.existsSync(dir) || !fs.readdirSync(dir).some((f) => f.endsWith('.xml'))) {
        fs.mkdirSync(dir, { recursive: true });
        execSync(`unzip -o "${zip}" -d "${dir}"`, { stdio: 'pipe' });
    }
    const sections = {};
    const agencies = new Map();
    const ownTypes = new Map();
    const idxOf = (m, v) => { if (!m.has(v)) m.set(v, m.size); return m.get(v); };
    let rows = 0;
    for (const xf of fs.readdirSync(dir).filter((f) => f.endsWith('.xml'))) {
        const s = fs.readFileSync(path.join(dir, xf), 'utf8');
        const re = /<土地標示部>([\s\S]*?)<\/土地標示部>/g;
        let m;
        while ((m = re.exec(s))) {
            const seg = m[1];
            const tag = (t) => { const mm = seg.match(new RegExp(`<${t}>([^<]*)</${t}>`)); return mm ? mm[1] : ''; };
            const sect = tag('段代碼');
            const landno = tag('地號');
            if (!sect || !landno) continue;
            (sections[sect] ||= { name: tag('段小段'), parcels: [] }).parcels.push([
                landno,
                +tag('登記面積') || 0,
                +tag('公告現值') || 0,
                +tag('公告地價') || 0,
                idxOf(agencies, tag('管理者名稱') || tag('所有權人名稱')),
                idxOf(ownTypes, tag('所有權人類別') || '公有'),
            ]);
            rows += 1;
        }
    }
    fs.writeFileSync(path.join(OUT, `${it.code}.json`), JSON.stringify({
        sections, agencies: [...agencies.keys()], ownTypes: [...ownTypes.keys()],
    }));
    total += rows;
    console.log(`✓ ${it.county}(${it.code}): ${rows} 筆`);
}
console.log(`合計 ${total} 筆 → out/`);
