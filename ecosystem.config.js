/* 
 *  This is the default license template.
 *  
 *  File: ecosystem.config.js
 *  Author: kneek
 *  Copyright (c) 2025 kneek
 *  
 *  To edit this license information: Press Ctrl+Shift+P and press 'Create new License Template...'.
 */

module.exports = {
  apps: [{
    name: 'discord-oauth-proxy',
    script: 'server.js',
    instances: 1,
    autorestart: true,
    watch: false,
    max_memory_restart: '1G',
    env: {
      NODE_ENV: 'development',
      PORT: 3004
    },
    env_production: {
      NODE_ENV: 'production',
      PORT: 3004
    },
    log_file: './logs/combined.log',
    out_file: './logs/out.log',
    error_file: './logs/error.log',
    log_date_format: 'YYYY-MM-DD HH:mm Z',
    merge_logs: true
  }]
};
