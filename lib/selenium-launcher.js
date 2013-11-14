var fs = require('fs')
  , path = require('path')
  , request = require('request')
  , hashFile = require('hash_file')
  , spawn = require('child_process').spawn
  , freeport = require('freeport')
  , EventEmitter = require('events').EventEmitter
  , util = require('util');

var override = process.env.SELENIUM_VERSION ? process.env.SELENIUM_VERSION.split(':') : []
  , version = override[0] || '2.37.0'
  , expectedSha = override[1] || 'fe8b7fcad6925b6d1c916e68850469e8ba67a6f9'
  , filename = 'selenium-server-standalone-' + version + '.jar'
  , url = 'http://selenium.googlecode.com/files/' + filename
  , outfile = path.join(path.dirname(__filename), filename);

function download(url, outfile, expectedSha, cb) {
  var real = function() {
    console.log('Downloading Selenium ' + version);
    var i = 0;
    request({ url: url })
      .on('end', function() {
        process.stdout.write('\n');
        cb();
      })
      .on('data', function() {
        if (i == 8000) {
          process.stdout.write('\n');
          i = 0;
        }
        if (i % 100 === 0) process.stdout.write('.');
        i++;
      })
      .pipe(fs.createWriteStream(outfile));
  };

  fs.stat(outfile, function(er, stat) {
    if (er) return real();
    hashFile(outfile, 'sha1', function(er, actualSha) {
      if (er) return cb(er);
      if (actualSha != expectedSha) return real();
      cb();
    });
  });
}

function run(cb,extraArgs) {
  freeport(function(er, port,extraArgs) {
    if (er) throw er;
    var args=[ '-jar', outfile, '-port', port];
    if(extraArgs){
        args=args.concat(extraArgs);
    }
    console.log('Starting Selenium ' + version + ' on port ' + port + (extraArgs ? " and extra args "+extraArgs : ""));
    var child = spawn('java', args);
    child.host = '127.0.0.1';
    child.port = port;
    child.extraArgs=extraArgs;
    var badExit = function() { cb(new Error('Could not start Selenium.')); };
    child.stdout.on('data', function(data) {
      var sentinal = 'Started org.openqa.jetty.jetty.Server';
      if (data.toString().indexOf(sentinal) != -1) {
        child.removeListener('exit', badExit);
        cb(null, child);
      }
    });
    child.on('exit', badExit);
  });
}

function FakeProcess(port,extraArgs) {
  EventEmitter.call(this);
  this.host = '127.0.0.1';
  this.port = port;
  this.extraArgs=extraArgs;
}
util.inherits(FakeProcess, EventEmitter);
FakeProcess.prototype.kill = function() {
  this.emit('exit');
};

module.exports = function(cb,extraArgs) {

  if (process.env.SELENIUM_LAUNCHER_PORT) {
    return process.nextTick(
      cb.bind(null, null, new FakeProcess(process.env.SELENIUM_LAUNCHER_PORT,extraArgs)));
  }

  download(url, outfile, expectedSha, function(er) {
    if (er) return cb(er);
    run(cb,extraArgs);
  });
};
