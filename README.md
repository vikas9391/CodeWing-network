docker run --rm `
  -p 9944:9944 -p 9933:9933 -p 30333:30333 `
  codewing-node `
  --dev `
  --tmp `
  --rpc-external `
  --rpc-cors all


node .\node_modules\tailwindcss\lib\cli.js init -p

wsl -d Ubuntu

pwd

ls

./target/release/solochain-template-node --dev
