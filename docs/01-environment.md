# TP Blockchain – Step 1: Environment Setup

Supply chain traceability on Ethereum (TP section 3, Étape 1)

## Overview

The first section of the TP has three parts: MetaMask (optional for now), opening Remix IDE, and creating the contract file. Only MetaMask can be postponed, since Remix has a built-in simulated blockchain. You will truly need MetaMask at the Sepolia deployment step (step 8).

## 3.1 MetaMask:

1. Install the extension from the official site (the TP gives metamask.com/fr, and metamask.io also works). Check the URL carefully, because fake MetaMask sites are common.
2. Create a new wallet and write the recovery phrase on paper. Do not save it in a file, a screenshot or the repo.
3. Use this wallet only for the TP, never with real funds.
4. Do not screenshot the recovery phrase or private key, including for the docs. Screenshot only the account address or network.

<img width="1902" height="936" alt="image" src="https://github.com/user-attachments/assets/fb426533-9276-43b0-9562-f608fce3cdbd" />
<img width="1901" height="937" alt="image" src="https://github.com/user-attachments/assets/ebb1ad2a-fae7-441e-b2fa-1481a5f3678e" />
<img width="1918" height="930" alt="image" src="https://github.com/user-attachments/assets/16609073-9de7-4179-8b3b-e68c6d22fd92" />
<img width="1918" height="933" alt="image" src="https://github.com/user-attachments/assets/b9ff4241-5d57-4ca6-9309-c5e2a96ab064" />


## 3.2 Open Remix

Go to https://remix.ethereum.org and locate the four main areas:

- **File Explorer**: where your files live
- **Solidity Compiler**: compiles the code
- **Deploy & Run Transactions**: deploys the contract and calls its functions
- **Terminal**: shows transactions and errors

Remix may open with a default workspace containing sample contracts. You can ignore them or create a new workspace for this project.

<img width="1918" height="1078" alt="image" src="https://github.com/user-attachments/assets/1a4b54fd-45ea-487c-9028-bcbdd0d4f22b" />


## 3.3 Create the contract file

1. In File Explorer, create a `contracts` folder if there is not one.
2. Create `SupplyChain.sol` inside it.
3. Paste in the code from TP section 5. You can leave this for later and do it after reading through the contract.

<img width="1918" height="1078" alt="image" src="https://github.com/user-attachments/assets/166140d9-25cf-4b5b-b0d7-637ab6e7fabc" />

