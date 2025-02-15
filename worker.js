const fs = require('fs');

// Function to read the config from a JSON file
function readConfig() {
  return JSON.parse(fs.readFileSync('config.json'));
}

// Function to write the config to a JSON file
function writeConfig(config) {
  fs.writeFileSync('config.json', JSON.stringify(config, null, 2));
}

// Function to update the config
function updateConfig() {
  const config = readConfig();
  const predefinedTokens = [
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6MjQ5MTc2LCJuYW1lIjoiQWx1bGFSMTU0MjgiLCJlbWFpbCI6Imw1YXpoMzhhQGZyZWVzb3VyY2Vjb2Rlcy5jb20iLCJyZWZlcnJlcl9pZCI6NDY3NzY4MDEsImV4cCI6MTc3MTA4OTA5MH0.TfEWkgZE-UdEEEoHXkUo0KB1SWCXFaFEwedv41QTsn0"
  ];

  for (let i = 0; i < config.length; i++) {
    config[i].tokens[0] = predefinedTokens[i % predefinedTokens.length];
  }

  writeConfig(config);
}

updateConfig();

console.log('config.json has been updated.');

