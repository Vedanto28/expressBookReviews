const assert = require('node:assert/strict');
const net = require('node:net');
const {execFile} = require('node:child_process');
const {promisify} = require('node:util');
const axios = require('axios');
const {
  getAllBooksAsync,
  getBookByISBNAsync,
  getBooksByAuthorAsync,
  getBooksByTitleAsync
} = require('../router/general.js');
// This fixture is only for assertions; every helper retrieves data over HTTP.
const expectedBooks = require('../router/booksdb.js');

const runFile = promisify(execFile);
let passed = 0;

async function check(label, operation) {
  await operation();
  passed++;
  console.log(`PASS ${label}`);
}

async function expectNotFound(label, operation, expectedPath) {
  await check(label, async () => {
    await assert.rejects(operation, error => {
      assert(axios.isAxiosError(error));
      assert.equal(error.response.status, 404);
      if (expectedPath) assert.equal(error.config.url, expectedPath);
      console.log(`  HTTP 404: ${JSON.stringify(error.response.data)}`);
      return true;
    });
  });
}

async function checkConnectionFailures() {
  const operations = [
    ['getAllBooksAsync', () => getAllBooksAsync()],
    ['getBookByISBNAsync', () => getBookByISBNAsync('1')],
    ['getBooksByAuthorAsync', () => getBooksByAuthorAsync('Chinua Achebe')],
    ['getBooksByTitleAsync', () => getBooksByTitleAsync('Things Fall Apart')]
  ];
  for (const [name, operation] of operations) {
    await check(`${name}: connection failure handled`, async () => {
      await assert.rejects(operation, error => {
        assert(axios.isAxiosError(error));
        assert.equal(error.code, 'ECONNREFUSED');
        assert.equal(error.response, undefined);
        assert.equal(error.config.timeout, 5000);
        console.log(`  ${error.code}: no HTTP response`);
        return true;
      });
    });
  }
}

async function main() {
  if (process.argv.includes('--connection-failure')) {
    await checkConnectionFailures();
    console.log(`${passed}/4 connection-failure checks passed.`);
    return;
  }

  await check('getAllBooksAsync: all ten original books', async () => {
    const books = await getAllBooksAsync();
    assert.equal(Object.keys(books).length, 10);
    assert.deepEqual(books, expectedBooks);
    console.log(`  JSON: ${JSON.stringify(books)}`);
  });
  await check('getBookByISBNAsync: ISBN 1', async () => {
    const book = await getBookByISBNAsync('1');
    assert.deepEqual(book, expectedBooks['1']);
    console.log(`  JSON: ${JSON.stringify(book)}`);
  });
  await check('getBooksByAuthorAsync: Chinua Achebe', async () => {
    const books = await getBooksByAuthorAsync('Chinua Achebe');
    assert.deepEqual(books, {'1': expectedBooks['1']});
    console.log(`  JSON: ${JSON.stringify(books)}`);
  });
  await check('getBooksByTitleAsync: Things Fall Apart', async () => {
    const books = await getBooksByTitleAsync('Things Fall Apart');
    assert.deepEqual(books, {'1': expectedBooks['1']});
    console.log(`  JSON: ${JSON.stringify(books)}`);
  });
  await check('case-insensitive author', async () => {
    assert.deepEqual(await getBooksByAuthorAsync('chinua achebe'), {'1': expectedBooks['1']});
  });
  await check('case-insensitive title', async () => {
    assert.deepEqual(await getBooksByTitleAsync('things fall apart'), {'1': expectedBooks['1']});
  });
  await check('multiple author matches: Unknown', async () => {
    const books = await getBooksByAuthorAsync('Unknown');
    assert.deepEqual(books, Object.fromEntries(['4', '5', '6', '7'].map(isbn => [isbn, expectedBooks[isbn]])));
    console.log(`  ISBNs: ${Object.keys(books).join(', ')}`);
  });
  await check('Unicode author encoding', async () => {
    assert.deepEqual(await getBooksByAuthorAsync('Honoré de Balzac'), {'9': expectedBooks['9']});
  });
  await check('Unicode title and apostrophe encoding', async () => {
    assert.deepEqual(await getBooksByTitleAsync("Njál's Saga"), {'7': expectedBooks['7']});
  });
  await expectNotFound('unknown ISBN rejects with HTTP information', () => getBookByISBNAsync('999'), '/isbn/999');
  const unknownAuthor = 'Nonexistent Author / & #';
  await expectNotFound('unknown author and special-character encoding',
    () => getBooksByAuthorAsync(unknownAuthor), `/author/${encodeURIComponent(unknownAuthor)}`);
  const unknownTitle = 'Nonexistent Title / ? & #';
  await expectNotFound('unknown title and special-character encoding',
    () => getBooksByTitleAsync(unknownTitle), `/title/${encodeURIComponent(unknownTitle)}`);
  await expectNotFound('encoded ISBN cannot inject a path or query',
    () => getBookByISBNAsync('1/extra?x=1'), `/isbn/${encodeURIComponent('1/extra?x=1')}`);
  await expectNotFound('empty author input rejects', () => getBooksByAuthorAsync(''), '/author/');
  await expectNotFound('empty title input rejects', () => getBooksByTitleAsync(''), '/title/');

  await check('repeated concurrent asynchronous requests', async () => {
    const books = await Promise.all(Array.from({length: 3}, () => getAllBooksAsync()));
    for (const result of books) assert.deepEqual(result, expectedBooks);
  });

  // Reserve an OS-selected loopback port, then close it before attempting requests.
  const probe = net.createServer();
  await new Promise((resolve, reject) => {
    probe.once('error', reject);
    probe.listen(0, '127.0.0.1', resolve);
  });
  const unusedPort = probe.address().port;
  await new Promise((resolve, reject) => probe.close(error => error ? reject(error) : resolve()));
  const result = await runFile(process.execPath, ['--unhandled-rejections=strict', __filename, '--connection-failure'], {
    env: {...process.env, BOOK_API_BASE_URL: `http://127.0.0.1:${unusedPort}`},
    timeout: 30000
  });
  process.stdout.write(result.stdout);
  assert.equal(result.stderr, '');
  console.log(`${passed}/16 retrieval/assertion groups and 4/4 connection-failure checks passed.`);
}

main().catch(error => {
  console.error(`FAIL ${error.message}`);
  process.exitCode = 1;
});
