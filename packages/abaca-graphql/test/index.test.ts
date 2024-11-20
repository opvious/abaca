import {errorFactories, errors, statusErrors} from '@opvious/stl-errors';
import events from 'events';
import * as gql from 'graphql';
import {createSchema, createYoga} from 'graphql-yoga';
import http from 'http';
import fetch from 'node-fetch';

import * as sut from '../src/index.js';

const [{duplicateBook}] = errorFactories({definitions: {duplicateBook: {}}});

const typeDefs = `
type Book {
  title: String!
  author: String
  never: Int!
}

type Query {
  book(title: String!): Book
}

type Mutation {
  addBook(title: String!, author: String): Book!
  deleteBook(title: String!): Boolean!
  clearBooks: Boolean!
}
`;

function createResolvers(): any {
  const books = new Map<string, string>();
  return {
    Query: {
      book(_parent, args) {
        const {title} = args;
        return books.has(title) ? {title, author: books.get(title)} : undefined;
      },
    },
    Mutation: {
      addBook(_parent, args) {
        const {title, author} = args;
        if (books.has(title)) {
          throw statusErrors.alreadyExists(
            duplicateBook({
              message: 'Title exists already',
              tags: {title},
              cause: errors.internal({message: 'boom'}),
            })
          );
        }
        books.set(title, author);
        return {title, author};
      },
      deleteBook(_parent, args) {
        if (!args.title) {
          throw new Error('Empty title');
        }
        throw errors.internal({message: 'Unsupported'});
      },
      clearBooks() {
        books.clear();
        return true;
      },
    },
  };
}

describe('Yoga router', () => {
  let server: http.Server;
  let executor: sut.GraphqlExecutor<typeof fetch>;

  beforeAll(async () => {
    const yoga = createYoga({
      schema: createSchema({
        typeDefs,
        resolvers: createResolvers(),
      }),
    });

    server = http.createServer(yoga).listen();
    await events.once(server, 'listening');
    const sdk = sut.createSdk<typeof fetch>({
      address: server.address()!,
      fetch,
    });
    executor = sut.graphqlExecutor(sdk.runQuery);
  });

  beforeEach(async () => {
    await executor('mutation{clearBooks}');
  });

  afterAll(async () => {
    server.close();
  });

  test('handles typename requests', async () => {
    const ret = await executor('{__typename}');
    expect(ret).toEqual({
      data: {__typename: 'Query'},
    });
  });

  test('handles OK query', async () => {
    const ret = await executor('query{book(title:"T"){title author}}');
    expect(ret).toEqual({data: {book: null}});
  });

  test('handles OK mutation', async () => {
    const ret = await executor('mutation{addBook(title:"T"){title author}}');
    expect(ret).toEqual({
      data: {addBook: {title: 'T', author: null}},
    });
  });

  test.skip('propagates status errors', async () => {
    await executor('mutation{addBook(title:"T"){title}}');
    const res = await executor('mutation{addBook(title:"T"){title}}');
    expect(res.data).toBeNull();
    expect(res.errors).toHaveLength(1);
    const err = res.errors?.[0];
    assert(err instanceof gql.GraphQLError);
    expect(err.toJSON()).toEqual({
      message:
        'Already exists error [ERR_DUPLICATE_BOOK]: Title exists ' + 'already',
      extensions: {
        status: 'ALREADY_EXISTS',
        exception: {
          code: 'ERR_DUPLICATE_BOOK',
          tags: {title: 'T'},
        },
        // The cause must not be forwarded.
      },
      path: ['addBook'],
    });
  });

  test.skip('handles internal errors', async () => {
    const res = await executor('mutation{deleteBook(title:"T")}');
    expect(res.data).toBeNull();
    expect(res.errors).toHaveLength(1);
    const err = res.errors?.[0];
    assert(err instanceof gql.GraphQLError);
    expect(err.toJSON()).toEqual({
      message: 'Unknown error',
      path: ['deleteBook'],
    });
  });

  test.skip('handles other errors', async () => {
    const res = await executor('mutation DeleteBook{deleteBook(title:"")}');
    expect(res.data).toBeNull();
    expect(res.errors).toHaveLength(1);
    const err = res.errors?.[0];
    assert(err instanceof gql.GraphQLError);
    expect(err.toJSON()).toEqual({
      message: 'Unknown error',
      path: ['deleteBook'],
    });
  });

  test.skip('handles GraphQL validation errors', async () => {
    const res = await executor('mutation{deleteBook(title:3)}');
    expect(res.data).toBeUndefined();
    expect(res.errors).toHaveLength(1);
    const err = res.errors?.[0];
    assert(err instanceof gql.GraphQLError);
    expect(err.toJSON()).toEqual({
      message:
        'Invalid argument error: String cannot represent a non string value: 3',
      extensions: {
        status: 'INVALID_ARGUMENT',
      },
    });
  });

  test.skip('handles GraphQL parse errors', async () => {
    const res = await executor('mutation{');
    expect(res.data).toBeUndefined();
    expect(res.errors).toHaveLength(1);
    const err = res.errors?.[0];
    assert(err instanceof gql.GraphQLError);
    expect(err.toJSON()).toEqual({
      message: expect.any(String),
    });
  });

  test.skip('handles non-nullable field errors', async () => {
    const res = await executor('mutation{addBook(title:"T"){never}}');
    expect(res.data).toBeNull();
    expect(res.errors).toHaveLength(1);
    const err = res.errors?.[0];
    assert(err instanceof gql.GraphQLError);
    expect(err.toJSON()).toEqual({
      message: 'Unknown error',
      path: expect.anything(),
    });
  });
});
