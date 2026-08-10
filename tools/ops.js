// node tools/ops.js — r6operators 패키지에서 아이콘/메타를 public/ops 로 굽는다.
// 맵과 같은 방식: node_modules 는 원본, public 은 생성물.
import { mkdirSync, writeFileSync } from 'node:fs';
import * as r6 from 'r6operators';

const OUT = new URL('../public/ops/', import.meta.url);
mkdirSync(OUT, { recursive: true });

const index = [];
for (const [id, op] of Object.entries(r6)) {
  if (op?.role !== 'Attacker' && op?.role !== 'Defender') continue;   // Recruit 제외
  // 아이콘은 단색 실루엣이 아니라 3톤이다: 루트 fill 을 상속하는 어두운 베이스 +
  // opacity:.4 음영 + #d75b2a 주황 액센트 + #fff 디테일. 루트 fill 을 건드리면
  // 베이스와 음영까지 같이 물들어서 뭉개지므로 색은 그대로 둔다.
  //   fill 기본값(검정)이 곧 베이스 색이고, 우리 UI 배경이 어두우니 그대로 맞다.
  const svg = op.toSVG()
    // 일러스트레이터가 남긴 <foreignObject>. 이게 있으면 캔버스에 그렸을 때
    // 캔버스가 오염돼서 getImageData / toDataURL 이 막힌다.
    .replace(/<foreignObject[\s\S]*?(?:\/>|<\/foreignObject>)/g, '');
  writeFileSync(new URL(`${id}.svg`, OUT), svg);
  index.push({ id, name: op.name, side: op.role === 'Attacker' ? 'atk' : 'def' });
}
index.sort((a, b) => a.name.localeCompare(b.name));
writeFileSync(new URL('index.json', OUT), JSON.stringify(index));
console.log(`${index.length} operators -> public/ops/`);
