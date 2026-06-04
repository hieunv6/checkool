module.exports = {
  apps: [
    {
      name: "checkool",
      script: "server.js",
      cwd: "/var/www/checkool",
      exec_mode: "fork",
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: "300M",
      env: {
        NODE_ENV: "production",
        API_PORT: "8787"
      },
      error_file: "/var/www/checkool/logs/pm2-error.log",
      out_file: "/var/www/checkool/logs/pm2-out.log",
      log_date_format: "YYYY-MM-DD HH:mm:ss Z"
    }
  ]
};
