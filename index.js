import { Connection, Products, Gateway } from 'klf-200-api';
import express from 'express';
import { readFile, writeFile } from 'fs/promises';
import { createLogger, format as _format, transports as _transports } from 'winston';
import debounce from 'debounce';

const logger = createLogger({
	level: 'info',
	format: _format.json(),
	defaultMeta: { service: 'user-service' },
	transports: [
		//
		// - Write all logs with importance level of `error` or less to `error.log`
		// - Write all logs with importance level of `info` or less to `combined.log`
		//
		new _transports.File({ filename: 'error.log', level: 'error' }),
		new _transports.File({ filename: 'combined.log' }),
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
const bounces = [];

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
		const ret = await bounces[req.params.room]('getPos', req.params.room);
		res.status(200).send(`${ret}`);
	} catch (err) {
		logger.error(err);
		res.status(500).send();
	}
});

app.put('/:room/pos/:pos', async (req, res) => {
	try {
		await bounces[req.params.room]('setPos', req.params.room, req.params.pos);
		res.status(200).send();
	} catch (err) {
		logger.error(err);
		res.status(500).send();
	}
});

async function main() {
	const data = await readFile(posFile, 'utf-8');
	blinds = JSON.parse(data);

	for (const blind in blinds) {
		bounces[blind] = debounce(klf, 1500);
	}

	try {
		await connect();
	} catch (err) {
		console.error(err);
		return;
	}

	console.log('[KLF] Logged in');
	// Keeping connection alive.
	setInterval(async () => {
		try {
			await refresh();
		} catch (err) {
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
		console.log('Creating new connection');
		if (!process.env.KLF_IP || !process.env.KLF_PWD) {
			throw new Error('You must define KLF_IP and KLP_PWD environment variables');
		}
		c = new Connection(process.env.KLF_IP);
		await c.loginAsync(process.env.KLF_PWD);
	} catch (err) {
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
		writeFile(posFile, JSON.stringify(blinds, null, 2), 'utf-8');
	} catch (err) {
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
	} catch (err) {
		logger.error(err);
		throw err;
	}
}

main().catch(err => logger.error(err));
