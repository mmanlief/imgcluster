var webpage = require('webpage');

var server, service;

server = require('webserver').create();


service = server.listen(parseInt(phantom.args[0]), function (request, response) {
    var page = webpage.create(),
        address, output, size;
    page.viewportSize = { width: 1024, height: 768 };
    console.log('handling request.');
    var address = "";
    if (request.method == "POST") {
        address = request.post;
    } else {
        console.log('url: ' + request.url);
        var idx = request.url.indexOf('=');
        if (idx == -1) {
            response.write('error');
            response.close();
            return;
        }
        address = unescape(request.url.substring(idx + 1, request.url.length));
    }

    console.log('got address: ' + address);


    var requestPage = function (depth) {
        console.log('opening page.  retry #' + depth);
        if (depth > 2) {
            console.log('giving up!');
            response.statusCode = 500;
            response.close();
            return;
        }
        page.open(address, function (status) {
            console.log('paged opened.  status: ' + status);
            if (status != 'success') {
                console.log('open failed.  retrying.');
                requestPage(depth + 1);
            } else {
                response.statusCode = 200;
                console.log('setting timeout.');
                window.setTimeout(function () {
                    console.log('getting title.');
                    var title = page.evaluate(function (s) {
                        return document.querySelector(s).innerText;
                    }, 'title');
                    console.log('rendering.');
                    var data = page.renderBase64("JPEG");
                    console.log('writing response.');
                    var allData = title + " ; " + data;
                    response.headers = {
                        "Content-Type": "text/plain",
                        "Content-Length": allData.length
                    };
                    response.write(allData);
                    response.close();
                    console.log('done');
                }, 50);
            }
        });
    };
    requestPage(0);
});

console.log('started.');