var fs = require('fs'),
	url = require('url'),
	async = require('async'),
	shell = require('shelljs'),
	request = require('request');

console.log('TVI-LILI v1.0 (' + process.version + ')');

var readline = require('readline');

var rl = readline.createInterface({
	input: process.stdin,
	output: process.stdout
});

var targetFile = null;

rl.question('TVI Url: ', function(targetUrl) {
rl.question('Filename (result.mpeg): ', function(filename) {

	targetFile = filename || 'result.mpeg';

	request(targetUrl, function(err, response, body) {
		if (err) {
			console.error('Error: Unable to get data from url.');
			process.exit(2);
		}
		
		var result = /videoUrl: '(.+?)'/.exec(body);
		var playlistUrl = null;
		
		if (result) {
			playlistUrl = result[1];
		} else {
			result = /load_video_programa\('(.+?)'/.exec(body);
			if (result !== null) {
				playlistUrl = 'http://video-on-demand.iol.pt/vod_http/mp4:' + result[1] + '-L-500k.mp4/playlist.m3u8';
			}
		}
	
		if (!playlistUrl) {
			console.error('Error: Unable to get playlist from this url. Maybe it\'s not compatible?')
			process.exit(2);
		}
	
		request(playlistUrl, function(err, response, body) {
			var playlist = body.split('\n');
			
			var bestBandwidth = 0;
			var bestChunkList = null;
	
			for(var i = 0; i < playlist.length; i++) {
				var str = playlist[i];
				if (str.indexOf('#EXT-X-STREAM-INF:BANDWIDTH=') === 0) {
					var bandwidth = parseInt(str.substring('#EXT-X-STREAM-INF:BANDWIDTH='.length))
					if (bestBandwidth < bandwidth) {
						bestChunkList = playlist[i + 1];
						bestBandwidth = bandwidth;
						i++;
					}
				}
			}
			
			var chunklistUrl = url.resolve(playlistUrl, bestChunkList);
	
			request(chunklistUrl, function(err, response, body) {
				var chunklist = body.split('\n');
				
				var chunks = [];
				for(var i = 0; i < chunklist.length; i++) {
					if (chunklist[i].indexOf('#') !== 0) {
						chunks.push(url.resolve(chunklistUrl, chunklist[i]));
					}
				}
	
				var tasks = [];
				for(var i = 0; i < chunks.length; i++) {
					(function(i, total, url) {
						tasks.push(function(cb) {
							console.log(`Downloading file ${i+1} of ${total}.`);
							var outputStream = fs.createWriteStream(targetFile, { flags: 'a' });
							request(url)
								.pipe(outputStream)
								.on('error', function(e) {
									outputStream.close();
									
									if (!shutingDown) {
										console.error('Error while download: ' + e)	
									} else {
										console.log('Download canceled.');
									}
								})
								.on('finish', function() {
									outputStream.close();	
									cb(); 
								});
						});
					})(i, chunks.length, chunks[i]);
				}
				
				if (shell.test('-e', targetFile))
					shell.rm('-f', targetFile);
				
				console.log('Getting and merging all files');
				async.series(tasks, function(err) {
					if (err)
						console.error('Error while getting and merging: ' + err);
					else
						console.log('All done.');
				});
							
			});
		});
	});
});
});

var shutingDown = false;

var onShutdown = function() {
	if (targetFile && shell.test('-e', targetFile))
		shell.rm('-f', targetFile);
		
	shutingDown = true;
	
	setTimeout(function() {
		console.error("Could not gracefully shutdown in time, forcefully shutting down");
		process.exit()
	}, 10*1000).unref();
};

process.on('SIGTERM', onShutdown);
process.on('SIGINT', onShutdown);