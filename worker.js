const fs = require('fs');
const path = require('path');

const rl = require('readline').createInterface({
  input: process.stdin,
  output: process.stdout
});

rl.question('Nhap so luong deviceId can tao: ', (answer) => {
  const data = [];
  for (let i = 0; i < parseInt(answer); i++) {
    const deviceId = `${Math.random().toString(36).substring(2, 10)}-${Math.random().toString(36).substring(2, 10)}-${Math.random().toString(36).substring(2, 10)}-${Math.random().toString(36).substring(2, 10)}`;
    data.push({
      deviceId,
      tokens: [
        "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6MjQ5MTc2LCJuYW1lIjoiQWx1bGFSMTU0MjgiLCJlbWFpbCI6Imw1YXpoMzhhQGZyZWVzb3VyY2Vjb2Rlcy5jb20iLCJyZWZlcnJlcl9pZCI6NDY3NzY4MDEsImV4cCI6MTc3MTA4OTA5MH0.TfEWkgZE-UdEEEoHXkUo0KB1SWCXFaFEwedv41QTsn0"
      ]
    });
  }

  const filePath = path.join(__dirname, 'config.json');
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2));

  rl.close();
});

