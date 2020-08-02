const SocksClient = require('socks').SocksClient;
var dgram = require('dgram');

const associateOptions = {
  proxy: {
    host: '127.0.0.1', // ipv4, ipv6, or hostname
    port: 8888,
    type: 5
  },

  command: 'associate',

  // When using associate, the destination should be the remote client that is expected to send UDP packets to the proxy server to be forwarded. This should be your local ip, or optionally the wildcard address (0.0.0.0)  UDP Client <-> Proxy <-> UDP Client
  destination: {
    host: '0.0.0.0',
    port: 0
  }
};
// Create a local UDP socket for sending packets to the proxy.
const udpSocket = dgram.createSocket('udp4');
udpSocket.bind({port: 0, address:'127.0.0.1', exclusive: true});

// Listen for incoming UDP packets from the proxy server.
udpSocket.on('message', (message, rinfo) => { 
  console.log(SocksClient.parseUDPFrame(message));
  /*
  { frameNumber: 0,
  remoteHost: { host: '127.0.0.1', port: 4444 },
  data: <Buffer 68 65 6c 6c 6f 2d 72 65 70 6c 79> }
  */
});

udpSocket.on('listening', () => {
  const address = udpSocket.address();
  console.log(`UDP Socket server listening ${address.address}:${address.port}`);

  associateOptions.destination = {
    host: address.address,
    port: address.port
  }

  let client = new SocksClient(associateOptions);

  // When the UDP relay is established, this event is fired and includes the UDP relay port to send data to on the proxy server.
  client.on('established', info => {
    console.log(info.remoteHost);
    /*
		{
		  host: '127.0.0.1',
		  port: 57819
		}
	  */

    // Send 'hello' to 127.0.0.1:4444
    const packet = SocksClient.createUDPFrame({
      remoteHost: {
        host: '127.0.0.1',
        port: 4444
      },
      data: Buffer.from('hello')
    });
    udpSocket.send(packet, info.remoteHost.port, info.remoteHost.host);
  });

  // Start connection
  client.connect();

});
