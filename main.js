#! /usr/bin/env node
const path			= require('path');
const pkg				= require(path.join(__dirname, 'package.json'));
const program		= require('commander');
const prompt		= require('prompt');
const request		= require('request');
const jsdom			= require('jsdom');
const { JSDOM }	= jsdom;
const Entities	= require('html-entities').XmlEntities;
const entities	=	new Entities();
const async			= require('async');
const colors		= require('colors/safe');

// Pretty simple setup for commander
program
	.version(pkg.version)
	.usage('[options] <search terms>')
	.option('-a, --artist <string>', 'limit search results by artist')
	.option('-s, --sort-by-rating', 'sort search results by their average rating')
	.option('-t, --type <string>', 'limit search results by type (chords, tabs, bass, ukelele)')
	.parse(process.argv);

// Error out on no search terms or incorrect options
if (program.args.length < 1 && !program.artist) {
	program.outputHelp();
	process.exit(1);
}
if (program.type && ['chords', 'tabs', 'bass', 'ukelele'].indexOf(program.type.toLowerCase()) === -1) {
	console.error('Error: ' + program.type + ' is an invalid type');
	program.outputHelp();
	process.exit(1);
}

// Figure out our URL
const types = {
	chords: 300,
	tabs: 200,
	bass: 400,
	ukelele: 800
};
const ugPre = 'https://www.ult' + 'ima' + 'te-gu' + 'ita' + 'r.com/search.php?view_state=advanced&band_name=' + (program.artist ? program.artist.replace(' ', '+') : '') + (program.type ? '&type%5B%5D=' + types[program.type.toLowerCase()] : '&type%5B%5D=300&type%5B%5D=200&type%5B%5D=400&type%5B%5D=800') + '&song_name=';

// Function to generate UG search string
const getURL = termsArr => ugPre + termsArr.join('+');

// Search results parser
const parseSearchResults = (document, callback) => {
	const resultRows = document.querySelectorAll('table.tresults tbody tr');
	let results = [];
	let currentArtist = '';
	async.each(resultRows, (row, doneWithRow) => {
		const songEl = row.querySelector('a.result-link');
		const artistEl = row.querySelector('a.search_art');
		const artist = artistEl ? entities.decode(artistEl.innerHTML.trim().replace(/<b>|<\/b>/g, '')) : currentArtist;
		if (artistEl) currentArtist = artist;
		// We only want chords and tabs, none of that tab pro shit
		if (songEl) {
			const ratingEl = row.querySelector('span.rating');
			const song = entities.decode(songEl.innerHTML.trim().replace(/<b>|<\/b>/g, ''));
			const url = songEl.getAttribute('href');
			const rating = ratingEl ? Number(ratingEl.getAttribute('title')) : 0;
			const type = row.querySelector('td:last-of-type strong').innerHTML;
			results.push({
				artist: artist,
				song: song,
				url: url,
				rating: rating,
				type: type
			});
			doneWithRow();
		} else {
			doneWithRow();
		}
	}, (err) => {
		if (program.sortByRating) {
			results = results.sort((a, b) => {
				return b.rating - a.rating;
			});
		}
		callback(err, results);
	});
};

// Tab page parser
const getTab = (url, callback) => {
	getPage(url, (err, body) => {
		if (err) {
			callback(err);
		} else {
			const document = new JSDOM(body).window.document;
			const selector = 'textarea.js-form-textarea';
			const tabNums = document.querySelectorAll(selector).length;
			if (tabNums === 1) {
				callback(null, document.querySelector(selector).value);
			} else {
				callback(new Error('Too many matches for tab results'));
			}
		}
	});
};

// Default request
const getPage = (url, callback) => {
	request.get(url, (error, response, body) => {
		if (error) {
			callback(error);
		} else if (response && response.statusCode && response.statusCode >= 400) {
			callback(new Error('HTTP status ' + response.statusCode));
		} else {
			callback(null, body);
		}
	});
};

// Main function
const main = () => {
	getPage(getURL(program.args), (err, body) => {
		if (err) {
			console.error(err);
			process.exit(1);
		} else {
			const document = new JSDOM(body).window.document;
			parseSearchResults(document, (err, results) => {
				if (err) console.error(err);
				if (results.length > 1) {
					console.log('Results (' + results.length + '):');
					async.eachOf(results, (result, index, callback) => {
						const preOutput = '[' + (index + 1) + '] ';
						const output = result.artist + ' - ' + result.song + ' - ' + result.rating + ' - ' + result.type.toUpperCase();
						if (result.rating >= 4.5) {
							console.log(preOutput + colors.green(output));
						} else if (result.rating >= 3.5) {
							console.log(preOutput + colors.yellow(output));
						} else {
							console.log(preOutput + colors.red(output));
						}
						callback();
					}, () => {
						prompt.start();
						prompt.message = '';
						prompt.delimeter = '';
						prompt.get({
							properties: {
								selection: {
									description: 'Please make your selection',
									conform: (val) => {
										if (isNaN(val) || val < 1 || val > results.length) {
											return false;
										} else {
											return true;
										}
									},
									message: 'Selection invalid',
									required: true
								}
							}
						}, (err, input) => {
							if (err) console.error(err);
							getTab(results[input.selection - 1].url, (err, tab) => {
								if (err) {
									console.error(err);
									process.exit(1);
								} else {
									console.log(tab);
								}
							});
						});
					});
				} else {
					getTab(results[0].url, (err, tab) => {
						if (err) {
							console.error(err);
							process.exit(1);
						} else {
							console.log(tab);
						}
					});
				}
			});
		}
	});
};

main();
