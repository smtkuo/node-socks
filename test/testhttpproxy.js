var rp = require('request-promise'),fs = require('fs')
 
var SocksProxyAgent  = require('https-proxy-agent')

var proxy = "http://user:pass@127.0.0.1:8080"

var agent = new SocksProxyAgent(proxy);

var options = {
	uri: 'http://ip.yooooo.us/ip',
	agent: agent,
	headers: {
		'User-Agent': 'Request-Promise'
	}
}


rp(options).then((responce)=>{
	console.log(responce)  
}).catch(console.log)
	 
	
