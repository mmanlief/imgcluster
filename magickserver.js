var http = require('http');
var url = require('url');
var fs = require('fs');
var im = require('imagemagick')

var basePath = "/home/mhm/";

var resizeCall = function(t, callback) {
  var proc = im.convert(t.args, t.opt.timeout, callback);
  if (t.opt.srcPath.match(/-$/)) {
    if ('string' === typeof t.opt.srcData) {
      proc.stdin.setEncoding('binary');
      proc.stdin.write(t.opt.srcData, 'binary');
      proc.stdin.end();
    } else {
      proc.stdin.end(t.opt.srcData);
    }
  }
  return proc;
};

var crop = function (options, callback) {
  if (typeof options !== 'object')
    throw new TypeError('First argument must be an object');
  if (!options.srcPath)
    throw new TypeError("No srcPath defined");
  if (!options.dstPath)
    throw new TypeError("No dstPath defined");
  if (!options.height && !options.width)
    throw new TypeError("No width or height defined");

  im.identify(options.srcPath, function(err, meta) {
    if (err) return callback && callback(err);
    var t         = im.resizeArgs(options),
        ignoreArg = false,
        args      = [];
    t.args.forEach(function (arg) {
      // ignoreArg is set when resize flag was found
      if (!ignoreArg && (arg != '-resize'))
        args.push(arg);
      // found resize flag! ignore the next argument
      if (arg == '-resize')
        ignoreArg = true;
      // found the argument after the resize flag; ignore it and set crop options
      if ((arg != "-resize") && ignoreArg) {
        var dSrc      = meta.width / meta.height,
            dDst      = t.opt.width / t.opt.height,
            resizeTo  = (dSrc < dDst) ? ''+t.opt.width+'x' : 'x'+t.opt.height;
        args = args.concat([
          '-resize', resizeTo,
          '-gravity', 'NorthWest',
          '-crop', ''+t.opt.width + 'x' + t.opt.height + '+0+0',
          '+repage'
        ]);
        ignoreArg = false;
      }
    })

    t.args = args;
    resizeCall(t, callback);
  })
};

var server = http.createServer(function(req, res){
	var reqUrl = url.parse(req.url, true);
    if(!(reqUrl.query.url)) {
        res.writeHead(500);
        res.end();
        return;
    }
	debugger;
		var options = {
			port: 8090,
			host: '127.0.0.1',
			method: 'GET',
			path: '/phantom/?url=' + reqUrl.query.url
		};

		var req2 = http.request(options, function(res2) {
            res2.setEncoding('utf8');
            var allData = "";
            var handleData = function() {
                if(-1 == allData.indexOf(';')) {
                    console.log("got bogus response.");
                    res.writeHead(500);
                    res.end();
                    return;
                }
                if(reqUrl.pathname == "/magick/img") {
                    var buf = new Buffer(allData.split(';')[1], 'base64');
                    var rnd = Math.floor((Math.random()*100000)+1).toString();
                    var srcFile = "/tmp/srcFile_" + rnd + ".jpeg";
                    var dstFile = "/tmp/dstFile_" + rnd + ".jpeg";
                    fs.writeFile(srcFile, buf, function(err) {
                        if(err) throw err;
                        console.log("cropping file " + srcFile + " with size: " + fs.statSync(srcFile).size);
                        crop({
                            srcPath: srcFile,
                            dstPath: dstFile,
                            width: parseInt(reqUrl.query.width),
                            height: parseInt(reqUrl.query.height),
                            quality: 1
                        }, function(err, stdout, stderr){
                            if (err) throw err;
                            fs.readFile(dstFile, function(err, data) {
                                if(err) throw err;
                                res.setHeader("Content-Type", "image/jpeg");
                                res.setHeader("Content-Length", data.length)
                                res.writeHead(200);
                                res.write(data);
                                res.end();
                                fs.unlink(srcFile);
                                fs.unlink(dstFile);
                            });
                        });
                    });
                }
                else
                {
                    res.setHeader("Content-Type", "text/plain");
                    res.writeHead(200);
                    res.write(allData.split(';')[0]);
                    res.end();
                }
            };
            res2.on('data', function (chunk) {
                allData += chunk;
            });
            res2.on('end', function() {
                if(allData.length != 0) {
                    console.log("handling data with length: " + allData.length)
                    handleData();
                }
            })
        });

		req2.on('error', function(e) {
            console.log('problem with request: ' + e.message);
            res.writeHead(500);
            res.end();
		});

		req2.end();
});

server.listen(8078, '0.0.0.0', function(){
	console.log('listening.')
});

var childproc = require('child_process');
var ids = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9 ];
var procs = [];

var shutdown = function () {
    procs.forEach(function(proc) {
        console.log("killing process: " + proc.pid)
        proc.kill();
    })
    process.exit();
};
process.on('SIGINT', shutdown);
process.on('uncaughtException', function(err) {
    console.log("unhandled exception: " + err);
    shutdown();
});

ids.forEach(function(id) {
    var port = "808" + id.toString();
    var proc = childproc.spawn(basePath + 'phantom/bin/phantomjs', ['--disk-cache=yes', '--max-disk-cache-size=102400', basePath + 'imgcluster/phantomserver.js', port]);
    proc.stdout.on('data', function(data) {
        console.log("phantom " + port + " : " + data);
    });
    proc.stderr.on('data', function(data) {
        if (/^execvp\(\)/.test(data)) {
            console.log("failed to spawn phantom " + port + " : " + data);
        } else {
            console.log("phantom " + port + " ERROR : " + data);
        }
    })
    proc.on('exit', function() {
        console.log("phantom " + port + "exited.");
    })
    procs.push(proc);
})
var nginx = childproc.spawn(basePath + 'nginx/sbin/nginx', ['-c', basePath + 'imgcluster/nginx.conf', '-p', basePath + '/nginx']);
nginx.stdout.on('data', function(data) {
    console.log("nginx : " + data);
});
nginx.stderr.on('data', function(data) {
    if (/^execvp\(\)/.test(data)) {
        console.log("failed to spawn nginx : " + data);
    } else {
        console.log("nginx ERROR : " + data);
    }
})
nginx.on('exit', function() {
    console.log("nginx exited.");
})
procs.push(nginx);