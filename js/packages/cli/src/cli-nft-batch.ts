#!/usr/bin/env ts-node
import * as fs from 'fs';
import * as path from 'path';
import { program } from 'commander';
import log from 'loglevel';
import { mintNFT, updateMetadata } from './commands/mint-nft';
import { loadWalletKey } from './helpers/accounts';
import { web3 } from '@project-serum/anchor';
import { PublicKey } from '@solana/web3.js';
import { getCluster } from './helpers/various'
import { getType } from 'mime';
import { uploadBatch } from './commands/upload';
import { StorageType } from './helpers/storage-type';

import {
  //CACHE_PATH,
  //CONFIG_LINE_SIZE_V2,
  EXTENSION_JSON,
  //CANDY_MACHINE_PROGRAM_V2_ID,
  //CONFIG_ARRAY_START_V2,
} from './helpers/constants';

program.version('0.0.1');
log.setLevel('info');

const supportedImageTypes = {
  'image/png': 1,
  'image/gif': 1,
  'image/jpeg': 1,
};

programCommand('mint')
  .option('-u, --url <string>', 'metadata url')
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  .action(async (directory, cmd) => {
    const { keypair, env, url } = cmd.opts();
    const solConnection = new web3.Connection(getCluster(env));
    const walletKeyPair = loadWalletKey(keypair);
    await mintNFT(solConnection, walletKeyPair, url);
  });

  programCommand('mint-batch')
  .option('-n, --number <string>', 'number of tokens')
  .option('-s, --storage <string>', 'storage type')
  .option('-f, --files <string>',
          'Directory containing images and jsons named from 0-n',
           val => {
              return fs.readdirSync(`${val}`).map(file => path.join(val, file));
          })
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  .action(async (directory, cmd) => {
    const { keypair, env, number, storage, files } = cmd.opts();
    const solConnection = new web3.Connection(getCluster(env));
    const walletKeyPair = loadWalletKey(keypair);

    let batchSize = 50;

    if (storage === StorageType.ArweaveSol && env !== 'mainnet-beta') {
      throw new Error(
        'The arweave-sol storage option only works on mainnet. For devnet, please use either arweave, aws or ipfs\n',
      );
    }

    if (storage === StorageType.Arweave) {
      log.warn(
        'WARNING: The "arweave" storage option will be going away soon. Please migrate to arweave-bundle or arweave-sol for mainnet.\n',
      );
    }
    if (!Object.values(StorageType).includes(storage)) {
      throw new Error(
        `Storage option must either be ${Object.values(StorageType).join(
          ', ',
        )}. Got: ${storage}`,
      );
    }

    const imageFiles = files.filter(it => {
      return !it.endsWith(EXTENSION_JSON);
    });
    const imageFileCount = imageFiles.length;

    imageFiles.forEach(it => {
      if (!supportedImageTypes[getType(it)]) {
        throw new Error(`The file ${it} is not a supported file type.`);
      }
    });

    const jsonFileCount = files.filter(it => {
      return it.endsWith(EXTENSION_JSON);
    }).length;

    const elemCount = number ? number : imageFileCount;

    if (imageFileCount !== jsonFileCount) {
      throw new Error(
        `number of img files (${imageFileCount}) is different than the number of json files (${jsonFileCount})`,
      );
    }

    if (elemCount < imageFileCount) {
      throw new Error(
        `max number (${elemCount})cannot be smaller than the number of elements in the source folder (${imageFileCount})`,
      );
    }

    log.info(`Beginning the upload for ${elemCount} (img+json) pairs`);

    const startMs = Date.now();
    log.info('started at: ' + startMs.toString());

    try {
      await uploadBatch({
        connection: solConnection,
        files,
        env,
        totalNFTs: elemCount,
        storage,
        batchSize,
        walletKeyPair,
      });
    } catch (err) {
      log.warn('upload was not successful, please re-run.', err);
    }
    const endMs = Date.now();
    const timeTaken = new Date(endMs - startMs).toISOString().substr(11, 8);
    log.info(
      `ended at: ${new Date(endMs).toISOString()}. time taken: ${timeTaken}`,
    );
    //await mintNFT(solConnection, walletKeyPair, url);
  });

programCommand('update-metadata')
  .option('-m, --mint <string>', 'base58 mint key')
  .option('-u, --url <string>', 'metadata url')
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  .action(async (directory, cmd) => {
    const { keypair, env, mint, url } = cmd.opts();
    const mintKey = new PublicKey(mint);
    const solConnection = new web3.Connection(getCluster(env));
    const walletKeyPair = loadWalletKey(keypair);
    await updateMetadata(mintKey, solConnection, walletKeyPair, url);
  });

function programCommand(name: string) {
  return program
    .command(name)
    .option(
      '-e, --env <string>',
      'Solana cluster env name',
      'devnet', //mainnet-beta, testnet, devnet
    )
    .option(
      '-k, --keypair <path>',
      `Solana wallet location`,
      '--keypair not provided',
    )
    .option('-l, --log-level <string>', 'log level', setLogLevel);
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
function setLogLevel(value, prev) {
  if (value === undefined || value === null) {
    return;
  }
  log.info('setting the log value to: ' + value);
  log.setLevel(value);
}

program.parse(process.argv);
