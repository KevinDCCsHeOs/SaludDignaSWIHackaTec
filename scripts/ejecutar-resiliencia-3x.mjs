import { spawnSync } from 'node:child_process';

const REPETICIONES = 3;
for (let i = 1; i <= REPETICIONES; i++) {
  console.log(`\n=== Resiliencia omnicanal — corrida ${i}/${REPETICIONES} ===`);
  const res = spawnSync(
    process.execPath,
    ['--test', 'tests/resiliencia/resiliencia-omnicanal.test.mjs'],
    { stdio: 'inherit' },
  );
  if (res.status !== 0) {
    console.error(`FALLO en corrida ${i}/${REPETICIONES}`);
    process.exit(res.status ?? 1);
  }
}
console.log(
  `\nOK: Las pruebas de resiliencia pasaron ${REPETICIONES}/${REPETICIONES} veces seguidas sin fallas (#39).`,
);
