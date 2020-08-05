var rp = require('request-promise')
var SocksProxyAgent  = require('socks-proxy-agent')

var proxy = "socks4a://user:pass@127.0.0.1:9999" //9999 8124

var agent = new SocksProxyAgent(proxy);

var options = {
	uri: 'https://ip.yooooo.us/ip',
	agent: agent,
	headers: {
		'User-Agent': 'Request-Promise'
	}
}

rp(options).then((responce)=>{
	console.log(responce)  
}).catch(console.log)
	 
	
