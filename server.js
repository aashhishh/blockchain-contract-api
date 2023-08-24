require("dotenv").config();
const express = require('express');
const { ethers } = require('ethers');
const { createAlchemyWeb3 } = require("@alch/alchemy-web3");
const multer = require('multer');
const axios = require('axios');

const app = express();
const storage = multer.memoryStorage();
const upload = multer({ storage: storage });

const PORT = 3000;

// Migrating the two NFT Api's into one
app.post('/uploadAsset', upload.single('file'), async (req, res) => {
    const bearerToken = req.headers.authorization; // "Authorization: Bearer TOKEN_VALUE"

    try {
        if (!req.query.json) {
            return res.status(400).send({ error: 'JSON parameter is missing' });
        }
        const clientJson = JSON.parse(req.query.json); // parse the JSON string from the URL query parameter
        // Send the binary file to the first API
        const firstApiResponse = await axios.post('https://api.nft.storage/upload', req.file.buffer, {
            headers: {
                'Authorization': bearerToken,
                'Content-Type': req.file.mimetype
            }
        });

        const extractedValue = firstApiResponse.data.value.cid; // Adjust to match actual field name
        const extractedlink = "ipfs://"+extractedValue

        // Modify the parsed JSON with the extracted value
        clientJson.ipfsImageLink = extractedlink; 
        // Send the modified JSON payload to the second API
        const secondApiResponse = await axios.post('https://api.nft.storage/upload', clientJson, {
            headers: {
                'Authorization': bearerToken,
                'Content-Type': 'application/json'
            }
        });

        ApiResponse = secondApiResponse.data.value.cid;
        const extractedlink2 = "ipfs://"+ApiResponse
        res.send({"cid":extractedlink2})

    } catch (error) {
        res.status(500).send({ error: 'There was an error chaining the APIs.' });
    }
});

const DB_NAME= process.env.DB_NAME
const DB_HOST=process.env.DB_HOST
const DB_PORT=process.env.DB_PORT
const DB_USER=process.env.DB_USER
const DB_PASSWORD= process.env.DB_PASSWORD

//database credentials
const { Sequelize, DataTypes } = require('sequelize');
// Configure Sequelize
const sequelize = new Sequelize(DB_NAME, DB_USER, DB_PASSWORD, {
    host: DB_HOST,
    port:DB_PORT,
    dialect: 'mysql' // e.g., 'mysql', 'postgres', etc.
});

const API_URL = process.env.API_URL;
const PUBLIC_KEY = process.env.PUBLIC_KEY;
const PRIVATE_KEY = process.env.PRIVATE_KEY;

const path = require('path');
const contractPath = path.join(__dirname, '../create-nft/artifacts/contracts/MyNFT.sol/MyNFT.json');
const contract = require(contractPath);
const web3 = createAlchemyWeb3(API_URL);

// const deploy = require('./scripts/deploy');  // Path to your Hardhat script
app.use(express.json()); // For parsing application/json

const { exec } = require('child_process');

//Creating NFT and minting the same
app.post('/MintNFT', (req, res) => {
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

// Define the model based on your Python model
const PersonalInfo = sequelize.define('Identity', {
    user_id: {
        type: DataTypes.STRING,
        primaryKey: true,
    },
    token_id: DataTypes.STRING(1000)
}, {
    tableName: 'identity',  
    timestamps: false
});

// Update token on the database
app.post('/updateToken', async (req, res) => {
    try {
        const { user_id, token } = req.body;

        if (!user_id || !token) {
            return res.status(400).json({ message: 'userID and token are required' });
        }

        const user = await PersonalInfo.findOne({ where: { user_id: user_id } });

        if (!user) {
            return res.status(404).json({ message: 'User not found' });
        }

        user.token = token;
        await user.save();

        res.json({ message: 'Token updated successfully!' });

    } catch (error) {
        console.error('Error updating token:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
});

app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(500).send('Internal server error.');
});


app.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
});

