const express = require('express');
const app = express();
const bodyParser = require('body-parser');
const Blockchain = require('./blockchain');
const uuid = require('uuid/v1');
const port = process.argv[2];
const rp = require('request-promise');

const nodeAddress = uuid().split('-').join('');

const bitcoin = new Blockchain();

app.use(bodyParser.json());
app.use(bodyParser.urlencoded({extended: false}));

// added nodemon to restart server everytime we make a change to .js files
app.get('/blockchain', function (req, res) {
    res.send(bitcoin);
});

app.post('/transaction', function (req, res) {
    //const blockIndex = bitcoin.createNewTransaction(req.body.amount, req.body.sender, req.body.recipient);
    //res.json({note: `Transaction will be added in block ${blockIndex}.`});
    const newTransaction = req.body;
    const blockIndex = bitcoin.addToPendingTransaction(newTransaction);
    res.json({note: `Transaction will be added in block ${blockIndex}.`});
});

app.post('/transaction/broadcast', function (req, res){
    const  newTransaction = bitcoin.createNewTransaction(req.body.amount,req.body.sender,req.body.recipient);
    bitcoin.addToPendingTransaction(newTransaction);

    const requestPromises = [];
    bitcoin.networkNodes.forEach(networkNodeUrl => {
       const requestOptions = {
           uri: networkNodeUrl + '/transaction',
           method: 'POST',
           body: newTransaction,
           json: true
       };

       requestPromises.push(rp(requestOptions));
    });

    Promise.all(requestPromises)
        .then(data => {
            res.json({note: 'transaction created and braodcasted'})
        });
});

app.get('/mine', function (req, res) {
    const lastBlock = bitcoin.getLastBlock();
    const previousBlockHash = lastBlock["hash"];
    const currentBlockData = {
        transactions: bitcoin.pendingTransactions,
        index: lastBlock["index"] + 1
    };
    const nonce = bitcoin.proofOfWork(previousBlockHash, currentBlockData);
    const blockHash = bitcoin.hashBlock(previousBlockHash,currentBlockData,nonce);
    // this below is the reward for mining a new block
    //bitcoin.createNewTransaction(12.5,"00", nodeAddress);

    const newBlock = bitcoin.createNewBlock(nonce,previousBlockHash,blockHash);

    const requestPromises = [];
    bitcoin.networkNodes.forEach(networkNodeUrl => {
       const requestOptions = {
           uri: networkNodeUrl + '/receive-new-block',
           method: 'POST',
           body: {newBlock: newBlock},
           json: true
       };

       requestPromises.push(rp(requestOptions));
    });

    Promise.all(requestPromises)
        .then(data => {
            const requestOptions = {
                uri: bitcoin.currentNodeUrl + '/transaction/broadcast',
                method: 'POST',
                body: {
                    amount: 12.5,
                    sender: "00",
                    recipient: nodeAddress
                },
                json: true
            };

            return rp(requestOptions);
        })
        .then(data => {
            res.json({
                note: "New block was mined and broadcasted successfully",
                block: newBlock
            });
        });
});

app.post('/receive-new-block', function(req,res){
   const newBlock = req.body.newBlock;
   const lastBlock = bitcoin.getLastBlock();
   const correctHash = lastBlock.hash === newBlock.previousBlockHash;
   const correctIndex = lastBlock['index'] + 1 === newBlock['index'];

   if (correctHash && correctIndex) {
       bitcoin.chain.push(newBlock);
       bitcoin.pendingTransactions = [];
       res.json({ note: 'New block received and accepted',
       newBlock: newBlock
       });
   } else {
       res.json({
           note: "New block rejected",
           newBlock: newBlock
       });
   }
});

app.post('/register-and-broadcast-node', function(req, res) {
    const newNodeUrl = req.body.newNodeUrl;
    if (bitcoin.networkNodes.indexOf(newNodeUrl) == -1) bitcoin.networkNodes.push(newNodeUrl);

    const regNodesPromises = []; // put in array because don't know how long it will take
    bitcoin.networkNodes.forEach(networkNodeUrl => {
        // /register-node
        const requestOptions = {
            uri: networkNodeUrl + '/register-node',
            method: 'POST',
            body: {newNodeUrl: newNodeUrl},
            json: true
        };

        regNodesPromises.push(rp(requestOptions));
    });
    Promise.all(regNodesPromises)
        .then(data => {
           //use the data
            const bulkRegisterOptions = {
                uri: newNodeUrl + '/register-nodes-bulk',
                method: 'POST',
                body: {allNetworkNodes: [...bitcoin.networkNodes, bitcoin.currentNodeUrl]}, //  . . . is to parse an array for its elements
                json: true
            };

           return  rp(bulkRegisterOptions);
        })
        .then(data => {
            res.json({note: ' New node is registered on the network'})
        });
});

app.post('/register-node', function(req, res) {
    const newNodeUrl = req.body.newNodeUrl;
    const nodeNotPresent = bitcoin.networkNodes.indexOf(newNodeUrl) == -1;
    const notCurrentNode = bitcoin.currentNodeUrl !== newNodeUrl;
    if (nodeNotPresent && notCurrentNode) bitcoin.networkNodes.push(newNodeUrl);
    res.json({note: 'New node registered successfully.'});
});

app.post('/register-nodes-bulk', function(req, res) {
    const allNetworkNodes = req.body.allNetworkNodes;
    allNetworkNodes.forEach(networkNodeUrl => {
        const  nodeNotAlreadyPresent = bitcoin.networkNodes.indexOf(networkNodeUrl) == -1;
        const notCurrentNode = bitcoin.currentNodeUrl !== networkNodeUrl;
        if (nodeNotAlreadyPresent && notCurrentNode) bitcoin.networkNodes.push(networkNodeUrl);
    });

    res.json({note: "Bulk registration successful"});
});


app.listen(port, function() {
    console.log(`Listening on port ${port}. . .`);
});