#!/usr/bin/env node
import { spawn } from 'node:child_process';

const RADMIN_IP = '26.237.103.241';

process.env.REACT_NATIVE_PACKAGER_HOSTNAME = RADMIN_IP;
process.env.EXPO_PUBLIC_API_URL = `http://${RADMIN_IP}:4000`;

console.log(`\n======================================================`);
console.log(`🚀 Iniciando Expo Mobile para Radmin VPN`);
console.log(`🌐 IP Radmin VPN: ${RADMIN_IP}`);
console.log(`🔗 API Backend: http://${RADMIN_IP}:4000`);
console.log(`📱 Los celulares en la red Radmin podrán escanear el QR`);
console.log(`======================================================\n`);

const child = spawn('npx', ['expo', 'start', '--host', 'lan'], {
  stdio: 'inherit',
  shell: true,
  env: process.env,
});

child.on('exit', (code) => {
  process.exit(code ?? 0);
});
