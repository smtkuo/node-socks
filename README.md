SOCKS implementation in node.js
===============================

A simple SOCKS implementation and demo proxy in `node.js <http://nodejs.org>`_.
 
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
