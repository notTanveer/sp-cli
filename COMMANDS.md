Here are some example CLI commands you can demo:

• Create a new wallet: sp create

• View wallet balance: sp balance

• Generate a regular receive address: sp address

• Mine to your new address (for regtest): sp mine -b 150

• Generate a silent payment address: sp silent-address

• Send BTC to a normal address or a silent address: sp send --address <address> --amount <btc>

• Scan for new transactions: sp scan

• Import a wallet from mnemonic: sp import --mnemonic "<mnemonic>"

• Open an existing wallet: sp open --password <pwd>