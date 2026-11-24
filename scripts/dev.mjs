import { spawn, spawnSync } from 'node:child_process';

function comandoNpm(args) {
  if (process.platform === 'win32') {
    return { cmd: 'cmd.exe', args: ['/d', '/s', '/c', 'npm.cmd', ...args] };
  }
  return { cmd: 'npm', args };
}

// 1. Asegurar contratos compartidos compilados antes de levantar los servicios
for (const pkg of ['@salud-digna/shared', '@salud-digna/ui']) {
  const { cmd, args } = comandoNpm(['run', 'build', `--workspace=${pkg}`]);
  const res = spawnSync(cmd, args, { stdio: 'inherit' });
  if (res.status !== 0) {
    console.error(`[dev] Error al compilar ${pkg}`);
    process.exit(res.status ?? 1);
  }
}

const servicios = [
  { nombre: 'api', workspace: '@salud-digna/api' },
  { nombre: 'whatsapp-bot', workspace: '@salud-digna/whatsapp-bot' },
  { nombre: 'web', workspace: '@salud-digna/web' },
];

const hijos = [];

function detenerTodos(codigo = 0) {
  for (const hijo of hijos) {
    if (!hijo.killed) {
      hijo.kill('SIGTERM');
    }
  }
  process.exit(codigo);
}

process.on('SIGINT', () => detenerTodos(0));
process.on('SIGTERM', () => detenerTodos(0));

for (const svc of servicios) {
  const { cmd, args } = comandoNpm(['run', 'dev', `--workspace=${svc.workspace}`]);
  const child = spawn(cmd, args, { stdio: ['ignore', 'pipe', 'pipe'] });

  child.stdout.on('data', (chunk) => {
    for (const linea of chunk.toString().split(/\r?\n/)) {
      if (linea.trim()) console.log(`[${svc.nombre}] ${linea}`);
    }
  });

  child.stderr.on('data', (chunk) => {
    for (const linea of chunk.toString().split(/\r?\n/)) {
      if (linea.trim()) console.error(`[${svc.nombre}] ${linea}`);
    }
  });

  child.on('exit', (code) => {
    if (code && code !== 0) {
      console.error(`[dev] El servicio ${svc.nombre} terminó con código ${code}`);
      detenerTodos(code);
    }
  });

  hijos.push(child);
}
