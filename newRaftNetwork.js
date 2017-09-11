let async = require('async')
let exec = require('child_process').exec
let prompt = require('prompt')
let fs = require('fs')

let whisper = require('./whisperNetwork.js')
let util = require('./util.js')
let constellation = require('./constellation.js')
let statistics = require('./networkStatistics.js')
let peerHandler = require('./peerHandler.js')
let fundingHandler = require('./fundingHandler.js')
let ports = require('./config.js').ports

prompt.start()

function startRaftNode(result, cb){
  let options = {encoding: 'utf8', timeout: 100*1000}
  let cmd = './startRaftNode.sh'
  cmd += ' '+ports.gethNodeRPC
  cmd += ' '+ports.gethNode
  cmd += ' '+ports.raftHttp
  let child = exec(cmd, options)
  child.stdout.on('data', function(data){
    cb(null, result)
  })
  child.stderr.on('data', function(error){
    console.log('ERROR:', error)
    cb(error, null)
  })
}

function createStaticNodeFile(enodeList, cb){
  let options = {encoding: 'utf8', timeout: 100*1000};
  let list = ''
  for(let enode of enodeList){
    list += '"'+enode+'",'
  }
  list = list.slice(0, -1)
  let staticNodes = '['
    + list
    +']'
  
  fs.writeFile('Blockchain/static-nodes.json', staticNodes, function(err, res){
    cb(err, res);
  });
}

function getConfiguration(result, cb){
  console.log('Please wait for others to join. Hit any key + enter once done.')
  prompt.get(['done'] , function (err, answer) {
    if(result.communicationNetwork){
      if(result.enodeList){
        result.enodeList.push(result.communicationNetwork.enodeList) 
      } else {
        result.enodeList = [result.communicationNetwork.enodeList]
      }
    }
    console.log('Enode list:', result.enodeList)
    createStaticNodeFile(result.enodeList, function(err, res){
      cb(err, result)
    })
  })
}

function addAddresslistToQuorumConfig(result, cb){
  result.blockMakers = result.addressList
  result.blockVoters = result.addressList
  if(result.communicationNetwork){
    console.log('result.communicationNetwork:', result.communicationNetwork)
    result.blockMakers.push(result.communicationNetwork.addressList) 
    result.blockVoters.push(result.communicationNetwork.addressList) 
  }
  result.threshold = 1 
  cb(null, result)
}

function startNewRaftNetwork(config, cb){
  console.log('[*] Starting new network...')

  let seqFunction = async.seq(
    util.ClearDirectories,
    util.CreateDirectories,
    util.GenerateNodeKey,    
    util.DisplayEnode,
    whisper.StartCommunicationNetwork,
    getConfiguration,
    util.GetNewGethAccount,
    addAddresslistToQuorumConfig,
    util.CreateQuorumConfig,
    util.CreateGenesisBlockConfig,
    constellation.CreateNewKeys, 
    constellation.CreateConfig,
    startRaftNode,
    util.CreateWeb3Connection,
    util.UnlockAllAccounts,
    whisper.AddEnodeResponseHandler,
    peerHandler.ListenForNewEnodes,
    whisper.AddEtherResponseHandler,
    fundingHandler.MonitorAccountBalances,
    statistics.Setup
  )

  let result = {
    localIpAddress: config.localIpAddress,
    networkMembership: config.networkMembership,
    folders: ['Blockchain', 'Blockchain/geth', 'Constellation'], 
    constellationKeySetup: [
      {folderName: 'Constellation', fileName: 'node'},
      {folderName: 'Constellation', fileName: 'nodeArch'},
    ],
    constellationConfigSetup: { 
      configName: 'constellation.config', 
      folderName: 'Constellation', 
      localIpAddress : config.localIpAddress, 
      localPort : ports.constellation,
      remoteIpAddress : null, 
      remotePort : ports.constellation,
      publicKeyFileName: 'node.pub', 
      privateKeyFileName: 'node.key', 
      publicArchKeyFileName: 'nodeArch.pub', 
      privateArchKeyFileName: 'nodeArch.key', 
    },
    "web3IPCHost": './Blockchain/geth.ipc',
    "web3RPCProvider": 'http://localhost:'+ports.gethNodeRPC
  }
  seqFunction(result, function(err, res){
    if (err) { return console.log('ERROR', err) }
    console.log('[*] New network started')
    cb(err, res)
  })
}

function handleStartingNewRaftNetwork(options, cb){
  config = {}
  config.localIpAddress = options.localIpAddress
  config.networkMembership = options.networkMembership
  startNewRaftNetwork(config, function(err, result){
    if (err) { return console.log('ERROR', err) }
    console.log('[*] Network started')
    config.raftNetwork = Object.assign({}, result)
    let networks = {
      raftNetwork: config.raftNetwork,
      communicationNetwork: config.communicationNetwork
    }
    cb(err, networks)
  })
}

exports.HandleStartingNewRaftNetwork = handleStartingNewRaftNetwork
