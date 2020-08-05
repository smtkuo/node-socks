SOCKS/HTTP/HTTPS proxy implementation in node.js
===============================

A simple SOCKS/HTTP/HTTPS proxy implementation and demo proxy in `node.js <http://nodejs.org>`_.
 
It supports both socks5/socks4/socks4a/http/https proxy
You can run it easily as::

  ./test/socksproxy5.js
  ./test/socksproxy4.js
  ./test/httpproxy.js
  
under windows you can run run.vbs
This will create a proxy socks5 at ``127.0.0.1`` on port ``8888``.
This will create a proxy socks4 socks4a at ``127.0.0.1`` on port ``9999``.
This will create a proxy http https at ``127.0.0.1`` on port ``8080``.

You can use this as a good starting point for writing a proxy or a tunnel!

## Features

* Supports SOCKS v4, v4a, and v5 proxy.
* Supports HTTP/HTTPS proxy.
* Supports the CONNECT and ASSOCIATE for SOCKS v5.
* Supports user/pass authentication.
* Supports Banned IPs.
* Supports SSH relay (since v1.1.0).

## Installation

`npm install @sansamour/node-socks`

## Usage

```typescript
// TypeScript
import { http, socks4, socks5 } from '@sansamour/node-socks';

// ES6 JavaScript
import { http, socks4, socks5 } from '@sansamour/node-socks';

// Legacy JavaScript
const socks5 = require('@sansamour/node-socks').socks5;

http.createServer(options);
socks4.createServer(options);
socks5.createServer(options);
```

Options
-------

* **authorization** - (< _function_ >validateUserPassword) A function with two parameters (_user_, _password_).

* **fileBannedIPs** - File location with content banned IPs semicolon separated.

* **onAccept** - A callback function with four parameters (_socket_, _info_, _accept_, _deny_)
    * **info** < _object_ > {_srcAddr_, _srcPort_, _dstAddr_, _dstPort_, _numClients_}
	
* **ssh** - < _object_ > {_host_, _port_, _username_, _password_}

## Quick Start Example

Create SOCKS v5 server: socks5://user:pass@127.0.0.1:9999 with file banned IPs `ip.txt` (semicolon separated)

```javascript
const { socks5 } = require('@sansamour/node-socks')

socks5.createServer({
	authorization: function(u,p){
		return u == 'user' && p == 'pass'
	},
	port: 9999,
	fileBannedIPs: './ip.txt'
});
```

With SOCKS v4/v4a proxy server support only Username Authentication (no Password).
Create SOCKS v4/v4a server: socks4://user:anypass@127.0.0.1:8888 with file banned IPs `ip.txt` (semicolon separated)

```javascript
const { socks4 } = require('@sansamour/node-socks')

socks4.createServer({
	authorization:function(u){
		return u == 'user'
	},
	port: 8888,
	fileBannedIPs: './ip.txt'
});
```

SSH relay example
```javascript
const { socks5 } = require('@sansamour/node-socks')

socks5.createServer({	
	port: 9999,
	ssh:{
	    host: '103.92.28.100',
	    port: 22,
	    username: 'root',
	    password: 'xxxx'
	}
});
```

Associate Example (UDP Relay) with SOCKS v5

## Further Reading:

Detail about this package.
http://tutorialspots.com/nodejs-create-socks4socks4asocks5httphttps-proxy-server-with-authentication-5653.html

Please read the SOCKS 5 specifications for more information on how to use Associate.
http://www.ietf.org/rfc/rfc1928.txt

## License

This work is licensed under the [MIT license](http://en.wikipedia.org/wiki/MIT_License).