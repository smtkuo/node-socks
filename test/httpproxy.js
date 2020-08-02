var exec = require('child_process').exec,
  cluster = require('cluster'),
  numCPUs = require('os').cpus().length,
  http = require('../lib/http.js');

var execKill = function(pid) {
  if (process.platform == 'win32') {
    exec('taskkill /pid ' + pid + ' /T /F');
  } else if (process.platform == 'linux') {
    exec('kill -9 ' + pid);
  }
}  
  
if (cluster.isMaster) {

  for (var i = 0; i < numCPUs; i++) {
    cluster.fork();
  }
  if (1 == numCPUs) cluster.fork(); //make sure it is more than 2

  cluster.on('exit', function(worker, code, signal) {
    if (worker.suicide !== true) {
      execKill(worker.process.pid);
    }
    var exitCode = worker.process.exitCode;
    console.log('worker ' + worker.process.pid + ' died (' + exitCode + '). restarting...');

    cluster.fork();

  });
} else {
  http.createServer({authorization:function(u,p){
	  return u=='user' && p=='pass'
  },fileBannedIPs:'./ip.txt'});
}
