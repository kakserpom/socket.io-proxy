var http = require('http'),
    fs = require('fs'),
    WebSocketClient = require('websocket').client,
    index = fs.readFileSync(__dirname + '/index.html');

var argv = require('minimist')(process.argv.slice(2));

var proxy = http.createServer(function (req, res) {
    res.writeHead(200, {'Content-Type': 'text/html'});
    res.end(index);
});

var io = require('socket.io').listen(proxy);

var router = require('socket.io-events')();
var buffers = [];
var connections = [];
router.use(function (socket, args, next) {
    socket.ws = connections[socket.id] || null;
    var event = args[0];
    argv.verbose && console.log('C2S', args);
    if (socket.ws == null || !socket.ws.connected) {
        if (buffers[socket.id] == null) {
            buffers[socket.id] = [];
        }
        argv.verbose && console.log('C2S: Buffering ' + event);
        buffers[socket.id].push(args);
    } else {
        argv.verbose && console.log('C2S: Sending ' + event);
        socket.ws.send(JSON.stringify(args));
    }
    next();
});

io.use(router);

// Emit welcome message on connection
io.on('connection', function (socket) {
    socket.log = function() {
        Array.prototype.unshift.call(arguments, socket.id + ':');
        console.log.apply(console, arguments);
    };
    var ws = new WebSocketClient();

    ws.on('connectFailed', function (error) {
        argv.verbose && socket.log('Connect Error: ' + error.toString());
        socket.disconnect();
    });

    ws.on('connect', function (connection) {
        argv.verbose && socket.log('connected to ' + argv['url']);
        connections[socket.id] = connection;
        if (buffers[socket.id] != null) {
            buffers[socket.id].forEach(function(item) {
                let event = item[0];
                let data = item[1];
                argv.verbose && socket.log('C2S: Sending ' + event + ' from buffer');
                connection.send(JSON.stringify([event, data]));
            });
            delete buffers[socket.id];
        }

        connection.on('error', function (error) {
            socket.disconnect();
            argv.verbose && socket.log("Connection Error: " + error.toString());
        });
        connection.on('close', function () {
            socket.disconnect();
            argv.verbose && socket.log('echo-protocol Connection Closed');
        });
        connection.on('message', function (message) {
            if (message.type === 'utf8') {
                var event = JSON.parse(message.utf8Data);
                argv.verbose && socket.log('received', event);
                socket.emit.apply(socket, JSON.parse(message.utf8Data));
            }
        });
    });

    argv.verbose && socket.log('connecting to ' + argv.url);
    ws.connect(argv.url, 'echo-protocol');
});

proxy.listen(argv.listen);