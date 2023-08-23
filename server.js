require("dotenv").config();
const express = require('express');
const { ethers } = require('ethers');
const { createAlchemyWeb3 } = require("@alch/alchemy-web3");

const API_URL = process.env.API_URL;
const PUBLIC_KEY = process.env.PUBLIC_KEY;
const PRIVATE_KEY = process.env.PRIVATE_KEY;

const path = require('path');
const contractPath = path.join(__dirname, '../create-nft/artifacts/contracts/MyNFT.sol/MyNFT.json');
const contract = require(contractPath);
const web3 = createAlchemyWeb3(API_URL);

const app = express();
// const deploy = require('./scripts/deploy');  // Path to your Hardhat script
app.use(express.json()); // For parsing application/json

const { exec } = require('child_process');

app.post('/deployAndMintNFT', (req, res) => {
    const tokenURI = req.body.tokenURI;

    if (!tokenURI) {
        return res.status(400).send('Missing required parameter: tokenURI.');
    }

    exec('npx hardhat --network mumbai run scripts/deploy.js', async (error, stdout, stderr) => {
        if (error) {
            console.error(`exec error: ${error}`);
            return res.status(500).send('Failed to deploy contract.');
        }
        const contractAddress = stdout.trim();

        console.log(`Deployed contract address: ${contractAddress}`);

        if (stderr) {
            console.error(`Error output from deploy.js: ${stderr}`);
        }

        if (!contractAddress.startsWith("0x")) {
            return res.status(500).send('Unexpected output from deployment script.');
        }

        try {
            const nftContract = new web3.eth.Contract(contract.abi, contractAddress);
            
            const nonce = await web3.eth.getTransactionCount(PUBLIC_KEY, "latest");
            const tx = {
                from: PUBLIC_KEY,
                to: contractAddress,
                nonce: nonce,
                gas: 500000,
                data: nftContract.methods.mintNFT(PUBLIC_KEY, tokenURI).encodeABI(),
            };

            const signedTx = await web3.eth.accounts.signTransaction(tx, PRIVATE_KEY);

            web3.eth.sendSignedTransaction(signedTx.rawTransaction)
                .once('transactionHash', (hash) => {
                    console.log("Transaction hash:", hash);
                })
                .once('receipt', (receipt) => {
                    if(receipt.status === true || receipt.status === '0x1') {
                        res.json({
                            status: 'success',
                            transactionHash: receipt.transactionHash,
                            contractAddress: contractAddress
                        });
                    } else {
                        res.status(400).json({
                            status: 'failed',
                            message: 'Transaction was reverted by the EVM',
                            transactionHash: receipt.transactionHash
                        });
                    }
                })
                .on('error', (error) => {
                    console.error("Failed to mint:", error);
                    res.status(500).json({
                        status: 'error',
                        message: 'Failed to send transaction or internal server error.'
                    });
                });

        } catch (err) {
            console.error("Error in /deployAndMintNFT:", err);
            res.status(500).send({
                status: 'error',
                message: 'Internal server error while minting.'
            });
        }
    });
});


app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(500).send('Internal server error.');
});

const PORT = 3002;
app.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
});

