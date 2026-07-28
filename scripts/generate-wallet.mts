import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";

const privateKey = generatePrivateKey();
const account = privateKeyToAccount(privateKey);

console.log("Arc Testnet wallet generated.");
console.log(`Address: ${account.address}`);
console.log(`Private key: ${privateKey}`);
console.log(
  "\nTestnet only. Store the private key in .env.local and fund the address " +
    "through the Circle faucet. Never commit .env.local.",
);

