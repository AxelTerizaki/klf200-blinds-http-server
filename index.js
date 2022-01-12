const { Connection, Products, Gateway } = require('klf-200-api');
const express = require('express');
const fs = require('fs/promises');
const winston = require('winston');

const logger = winston.createLogger({
  level: 'info',
  format: winston.format.json(),
  defaultMeta: { service: 'user-service' },
  transports: [
    //
    // - Write all logs with importance level of `error` or less to `error.log`
    // - Write all logs with importance level of `info` or less to `combined.log`
    //
    new winston.transports.File({ filename: 'error.log', level: 'error' }),
    new winston.transports.File({ filename: 'combined.log' }),
  ],
});

// This is to catch stuff and not exit if there's an error, like a lost connection.

process.on('uncaughtException', (exception) => {
	console.log('Uncaught exception:', exception);
	logger.error('', { service: 'UncaughtException', obj: exception });
});

process.on('unhandledRejection', (error) => {
	console.log('Unhandled Rejection at:', error);
	logger.error('', { service: 'UnhandledRejection', obj: error });
});

const app = express();
const port = 5000;

const posFile = 'positions.json';

let blinds;

app.listen(port, () => {
	console.log(`KLF listening on port ${port}.`);
});

function getPositionFromPercentage(num) {
	// We get a percentage, we need a number between 0 and 1
	// 0 = Open (100%), 1 = Closed (0%)
	// Homebridge plugin is configured to get inverted positions as the KLF returns these.
	return num / 100;
}

app.get('/:room/pos', async (req, res) => {
	try {
		const ret = await klf('getPos', req.params.room)
		res.status(200).send(`${ret}`);
	} catch(err) {
		logger.error(err);
		res.status(500).send();
	}
});

app.put('/:room/pos/:pos', async (req, res) => {
	try {
		await klf('setPos', req.params.room, req.params.pos);
		res.status(200).send();
	} catch(err) {
		logger.error(err);
		res.status(500).send();
	}
});

async function main() {
	const data = await fs.readFile(posFile, 'utf-8');
	blinds = JSON.parse(data);
	await connect();
	console.log('[KLF] Logged in');
	// Keeping connection alive.
	setInterval(async () => {
		try {
			await refresh();
		} catch(err) {
			logger.error(err);
			// Likely disconnection, restart connection
			await connect();
		}
	}, 30000)
	await refresh();
}

let c;

async function connect() {
	try {
		c = new Connection('xxx');
		await c.loginAsync('yyy');
	} catch(err) {
		logger.error(err);
		throw err;
	}
}

async function refresh() {
	try {
		const g = new Gateway(c);
		await g.getVersionAsync();
		const products = await Products.createProductsAsync(c);
		for (const room of Object.keys(blinds)) {
			const p = products.findByName(blinds[room].name);
			await p.refreshAsync();
			//console.log(blinds[room].name, p.CurrentPosition, p.TargetPosition, p.CurrentPositionRaw, p.TargetPositionRaw);
			blinds[room].pos = p.CurrentPosition;
		}
		fs.writeFile(posFile, JSON.stringify(blinds, null, 2), 'utf-8');
	} catch(err) {
		logger.error(err);
		throw err;
	}
}

async function klf(command, room, option) {
	try {
		console.log(`[KLF] Got command ${command} for room ${room} and option ${option}`);
		if (command === 'getPos') {
			return blinds[room].pos;
		} else if (command === 'setPos') {
			const products = await Products.createProductsAsync(c);
			let blind = products.findByName(blinds[room].name);
			await blind.setTargetPositionAsync(getPositionFromPercentage(option));
			blinds[room].pos = option;
		};
	} catch(err) {
		logger.error(err);
		throw err;
	}
}

main().catch(err => logger.error(err));
