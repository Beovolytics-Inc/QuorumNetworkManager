let async = require('async')
let exec = require('child_process').exec
let prompt = require('prompt')
let fs = require('fs')

let whisper = require('./Communication/whisperNetwork.js')
let util = require('./util.js')
let constellation = require('./constellation.js')
let statistics = require('./networkStatistics.js')
let peerHandler = require('./peerHandler.js')
let fundingHandler = require('./fundingHandler.js')
let ports = require('./config.js').ports

prompt.start()

function displayGethAccount(result, cb){
  console.log('Account:', result.addressList[0])
  cb(null, result)
}

function startRaftNode(result, cb){
  let options = {encoding: 'utf8', timeout: 100*1000}
  let cmd = './startRaftNode.sh'
  cmd += ' '+ports.gethNodeRPC
  cmd += ' '+ports.gethNode
  cmd += ' '+ports.raftHttp
  cmd += ' '+result.communicationNetwork.raftID
  let child = exec(cmd, options)
  child.stdout.on('data', function(data){
    cb(null, result)
  })
  child.stderr.on('data', function(error){
    console.log('ERROR:', error)
    cb(error, null)
  })
}

function handleExistingFiles(result, cb){
  if(result.keepExistingFiles == false){ 
    let seqFunction = async.seq(
      util.ClearDirectories,
      util.CreateDirectories,
      util.GetNewGethAccount,
      util.GenerateNodeKey,    
      util.DisplayEnode,
      constellation.CreateNewKeys, 
      constellation.CreateConfig
    )
    seqFunction(result, function(err, res){
      if (err) { return console.log('ERROR', err) }
      cb(null, res)
    })
  } else {
    cb(null, result)
  }
}

function handleNetworkConfiguration(result, cb){
  if(result.keepExistingFiles == false){ 
    let seqFunction = async.seq(
      whisper.RequestExistingNetworkMembership,
      whisper.GetGenesisBlockConfig,
      whisper.GetStaticNodesFile
    )
    seqFunction(result, function(err, res){
      if (err) { return console.log('ERROR', err) }
      cb(null, res)
    })
  } else {
    fs.readFile('Blockchain/raftID', function(err, data){
      console.log('raftID:', data)
      result.communicationNetwork.raftID = data 
      cb(null, result)
    })
  }
}

function joinRaftNetwork(config, cb){
  console.log('[*] Starting new network...')

  let seqFunction = async.seq(
    handleExistingFiles,
    handleNetworkConfiguration,
    startRaftNode,
    util.CreateWeb3Connection,
    whisper.AddEnodeResponseHandler,
    peerHandler.ListenForNewEnodes,
    fundingHandler.MonitorAccountBalances
  )

  let result = {
    localIpAddress: config.localIpAddress,
    remoteIpAddress : config.remoteIpAddress, 
    keepExistingFiles: config.keepExistingFiles,
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
      remoteIpAddress : config.remoteIpAddress, 
      remotePort : ports.constellation,
      publicKeyFileName: 'node.pub', 
      privateKeyFileName: 'node.key', 
      publicArchKeyFileName: 'nodeArch.pub', 
      privateArchKeyFileName: 'nodeArch.key', 
    },
    communicationNetwork: config.communicationNetwork,
    "web3IPCHost": './Blockchain/geth.ipc',
    "web3RPCProvider": 'http://localhost:'+ports.gethNodeRPC
  }
  seqFunction(result, function(err, res){
    if (err) { return console.log('ERROR', err) }
    console.log('[*] New network started')
    cb(err, res)
  })
}

function handleJoiningRaftNetwork(options, cb){
  config = {}
  config.localIpAddress = options.localIpAddress
  config.keepExistingFiles = options.keepExistingFiles
  console.log('In order to join the network, '
    + 'please enter the ip address of the coordinating node')
  prompt.get(['ipAddress'], function (err, network) {
    config.remoteIpAddress = network.ipAddress
    whisper.JoinCommunicationNetwork(config, function(err, result){
      if (err) { return console(err) }
      config.communicationNetwork = Object.assign({}, result)
      joinRaftNetwork(config, function(err, result){
        if (err) { return console.log('ERROR', err) }
        let networks = {
          raftNetwork: Object.assign({}, result),
          communicationNetwork: config.communicationNetwork
        }
        cb(err, networks)
      })
    })
  })
}

exports.HandleJoiningRaftNetwork = handleJoiningRaftNetwork
