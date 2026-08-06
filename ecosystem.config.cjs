module.exports = {
  apps: [{
    name: 'rice-backend',
    cwd: '/opt/rice',
    script: 'backend/src/server.js',
    node_args: '--env-file=/opt/rice/.env',
    instances: 1,
    exec_mode: 'fork',
    autorestart: true,
    max_memory_restart: '450M',
    time: true,
    out_file: '/opt/rice/logs/backend-out.log',
    error_file: '/opt/rice/logs/backend-error.log',
    merge_logs: true
  }]
};
