"use strict";

function _interopDefault(ex) {
  return ex && "object" == typeof ex && "default" in ex ? ex.default : ex;
}

var wonka = require("wonka");

var graphql = require("graphql");

var stringify = _interopDefault(require("fast-json-stable-stringify"));

var gql = _interopDefault(require("graphql-tag"));

var react = require("react");

function _extends() {
  return (_extends = Object.assign || function(target) {
    for (var i = 1; i < arguments.length; i++) {
      var source = arguments[i];
      for (var key in source) {
        if (Object.prototype.hasOwnProperty.call(source, key)) {
          target[key] = source[key];
        }
      }
    }
    return target;
  }).apply(this, arguments);
}

var generateErrorMessage = function(networkErr, graphQlErrs) {
  var error = "";
  if (void 0 !== networkErr) {
    return error = "[Network] " + networkErr.message;
  }
  if (void 0 !== graphQlErrs) {
    graphQlErrs.forEach(function _ref(err) {
      error += "[GraphQL] " + err.message + "\n";
    });
  }
  return error.trim();
};

var rehydrateGraphQlError = function(error) {
  if ("string" == typeof error) {
    return new graphql.GraphQLError(error);
  } else if ("object" == typeof error && error.message) {
    return new graphql.GraphQLError(error.message, error.nodes, error.source, error.positions, error.path, error.originalError, error.extensions || {});
  } else {
    return error;
  }
};

function _toString() {
  return this.message;
}

var CombinedError = function(Error) {
  function CombinedError(ref) {
    var networkError = ref.networkError;
    var response = ref.response;
    var normalisedGraphQLErrors = (ref.graphQLErrors || []).map(rehydrateGraphQlError);
    var message = generateErrorMessage(networkError, normalisedGraphQLErrors);
    Error.call(this, message);
    this.name = "CombinedError";
    this.message = message;
    this.graphQLErrors = normalisedGraphQLErrors;
    this.networkError = networkError;
    this.response = response;
  }
  if (Error) {
    CombinedError.__proto__ = Error;
  }
  (CombinedError.prototype = Object.create(Error && Error.prototype)).constructor = CombinedError;
  CombinedError.prototype.toString = _toString;
  return CombinedError;
}(Error);

var hash = function(x) {
  for (var h = 5381, i = 0, l = 0 | x.length; i < l; i++) {
    h = (h << 5) + h + x.charCodeAt(i);
  }
  return h >>> 0;
};

var docNameCache = Object.create(null);

function _ref(acc, definition) {
  return acc + (void 0 !== definition.name ? definition.name.value : "");
}

var getKeyForRequest = function(query, vars) {
  var docKey = function(doc) {
    if (void 0 !== doc.__key) {
      return doc.__key;
    }
    var name = doc.definitions.reduce(_ref, "");
    if ("production" !== process.env.NODE_ENV && "" !== name) {
      var printed = graphql.print(doc);
      if (!(name in docNameCache)) {
        docNameCache[name] = printed;
      } else if (docNameCache[name] !== printed) {
        console.warn("Warning: Encountered multiple DocumentNodes with the same name.");
      }
    }
    if ("" === name) {
      name = graphql.print(doc);
    }
    var key = hash(name);
    doc.__key = key;
    return key;
  }(query);
  if (null == vars) {
    return docKey;
  }
  return hash("" + docKey + stringify(vars));
};

var createRequest = function(q, vars) {
  var query = "string" == typeof q ? gql([ q ]) : q;
  return {
    key: getKeyForRequest(query, vars),
    query: query,
    variables: vars || {}
  };
};

var collectTypes = function(obj, types) {
  if (void 0 === types) {
    types = [];
  }
  if (Array.isArray(obj)) {
    obj.forEach(function _ref(inner) {
      return collectTypes(inner, types);
    });
  } else if ("object" == typeof obj && null !== obj) {
    for (var key in obj) {
      if (obj.hasOwnProperty(key)) {
        var val = obj[key];
        if ("__typename" === key && "string" == typeof val) {
          types.push(val);
        } else if ("object" == typeof val && null !== val) {
          collectTypes(val, types);
        }
      }
    }
  }
  return types;
};

function _ref2(v, i, a) {
  return a.indexOf(v) === i;
}

var collectTypesFromResponse = function(response) {
  return collectTypes(response).filter(_ref2);
};

var formatNode = function(n) {
  return void 0 !== n.selectionSet && void 0 !== n.selectionSet.selections ? _extends({}, n, {
    selectionSet: _extends({}, n.selectionSet, {
      selections: n.selectionSet.selections.concat([ {
        kind: "Field",
        name: {
          kind: "Name",
          value: "__typename"
        }
      } ])
    })
  }) : !1;
};

var formatDocument = function(astNode) {
  return graphql.visit(astNode, {
    Field: formatNode,
    InlineFragment: formatNode,
    OperationDefinition: formatNode
  });
};

var toSuspenseSource = function(source) {
  return wonka.make(function(ref) {
    var end = ref[1];
    var isCancelled = !1;
    var resolveSuspense;
    var synchronousResult;
    var teardown = wonka.pipe(source, wonka.onPush(ref[0]), wonka.onEnd(end), wonka.subscribe(function(value) {
      if (void 0 === resolveSuspense) {
        synchronousResult = value;
      } else if (!isCancelled) {
        resolveSuspense(value);
        end();
        teardown();
      }
    }))[0];
    if (void 0 === synchronousResult) {
      throw new Promise(function _ref(resolve) {
        resolveSuspense = resolve;
      });
    }
    return function() {
      isCancelled = !0;
      teardown();
    };
  });
};

var noop = function() {};

var shouldSkip = function(ref) {
  var operationName = ref.operationName;
  return "subscription" !== operationName && "query" !== operationName;
};

function _ref$1(x) {
  return "" + x;
}

var serializeResult = function(ref) {
  var error = ref.error;
  var result = {
    data: ref.data,
    error: void 0
  };
  if (void 0 !== error) {
    result.error = {
      networkError: "" + error.networkError,
      graphQLErrors: error.graphQLErrors.map(_ref$1)
    };
  }
  return result;
};

var deserializeResult = function(operation, result) {
  var error = result.error;
  var deserialized = {
    operation: operation,
    data: result.data,
    error: void 0
  };
  if (void 0 !== error) {
    deserialized.error = new CombinedError({
      networkError: new Error(error.networkError),
      graphQLErrors: error.graphQLErrors
    });
  }
  return deserialized;
};

var shouldSkip$1 = function(ref) {
  var operationName = ref.operationName;
  return "mutation" !== operationName && "query" !== operationName;
};

function _ref$2(operation) {
  return _extends({}, operation, {
    query: formatDocument(operation.query)
  });
}

function _ref5(op) {
  return shouldSkip$1(op);
}

var cacheExchange = function(ref) {
  var forward = ref.forward;
  var client = ref.client;
  var resultCache = new Map();
  var operationCache = Object.create(null);
  var mapTypeNames = _ref$2;
  var handleAfterMutation = afterMutation(resultCache, operationCache, client);
  var handleAfterQuery = afterQuery(resultCache, operationCache);
  var isOperationCached = function(operation) {
    var requestPolicy = operation.context.requestPolicy;
    return "query" === operation.operationName && "network-only" !== requestPolicy && ("cache-only" === requestPolicy || resultCache.has(operation.key));
  };
  function _ref2(op) {
    return !shouldSkip$1(op) && isOperationCached(op);
  }
  function _ref3(operation) {
    var requestPolicy = operation.context.requestPolicy;
    var cachedResult = resultCache.get(operation.key);
    if ("cache-and-network" === requestPolicy) {
      reexecuteOperation(client, operation);
    }
    if (void 0 !== cachedResult) {
      return cachedResult;
    }
    return {
      operation: operation,
      data: void 0,
      error: void 0
    };
  }
  function _ref4(op) {
    return !shouldSkip$1(op) && !isOperationCached(op);
  }
  function _ref6(response) {
    if (response.operation && "mutation" === response.operation.operationName) {
      handleAfterMutation(response);
    } else if (response.operation && "query" === response.operation.operationName) {
      handleAfterQuery(response);
    }
  }
  return function(ops$) {
    var sharedOps$ = wonka.share(ops$);
    var cachedOps$ = wonka.pipe(sharedOps$, wonka.filter(_ref2), wonka.map(_ref3));
    var forwardedOps$ = wonka.pipe(wonka.merge([ wonka.pipe(sharedOps$, wonka.filter(_ref4), wonka.map(mapTypeNames)), wonka.pipe(sharedOps$, wonka.filter(_ref5)) ]), forward, wonka.tap(_ref6));
    return wonka.merge([ cachedOps$, forwardedOps$ ]);
  };
};

var reexecuteOperation = function(client, operation) {
  return client.reexecuteOperation(_extends({}, operation, {
    context: _extends({}, operation.context, {
      requestPolicy: "network-only"
    })
  }));
};

var afterMutation = function(resultCache, operationCache, client) {
  function _ref8(key) {
    if (resultCache.has(key)) {
      var operation = resultCache.get(key).operation;
      resultCache.delete(key);
      reexecuteOperation(client, operation);
    }
  }
  return function(response) {
    var pendingOperations = new Set();
    function _ref7(key) {
      return pendingOperations.add(key);
    }
    collectTypesFromResponse(response.data).forEach(function(typeName) {
      var operations = operationCache[typeName] || (operationCache[typeName] = new Set());
      operations.forEach(_ref7);
      operations.clear();
    });
    pendingOperations.forEach(_ref8);
  };
};

var afterQuery = function(resultCache, operationCache) {
  return function(response) {
    var key = response.operation.key;
    if (void 0 === response.data) {
      return;
    }
    resultCache.set(key, response);
    collectTypesFromResponse(response.data).forEach(function(typeName) {
      (operationCache[typeName] || (operationCache[typeName] = new Set())).add(key);
    });
  };
};

var isSubscriptionOperation = function(operation) {
  return "subscription" === operation.operationName;
};

function _ref2$1(op) {
  return !isSubscriptionOperation(op);
}

function _ref$3(op) {
  return console.log("[Exchange debug]: Incoming operation: ", op);
}

function _ref2$2(result) {
  return console.log("[Exchange debug]: Completed operation: ", result);
}

var dedupExchange = function(ref) {
  var forward = ref.forward;
  var inFlightKeys = new Set();
  var filterIncomingOperation = function(operation) {
    var key = operation.key;
    var operationName = operation.operationName;
    if ("teardown" === operationName) {
      inFlightKeys.delete(key);
      return !0;
    } else if ("query" !== operationName) {
      return !0;
    }
    var isInFlight = inFlightKeys.has(key);
    inFlightKeys.add(key);
    return !isInFlight;
  };
  var afterOperationResult = function(ref) {
    inFlightKeys.delete(ref.operation.key);
  };
  return function(ops$) {
    var forward$ = wonka.pipe(ops$, wonka.filter(filterIncomingOperation));
    return wonka.pipe(forward(forward$), wonka.tap(afterOperationResult));
  };
};

function _ref$4(operation) {
  var operationName = operation.operationName;
  return "query" === operationName || "mutation" === operationName;
}

var fetchExchange = function(ref) {
  var forward = ref.forward;
  var isOperationFetchable = _ref$4;
  function _ref2(op) {
    return !isOperationFetchable(op);
  }
  return function(ops$) {
    var sharedOps$ = wonka.share(ops$);
    var fetchResults$ = wonka.pipe(sharedOps$, wonka.filter(isOperationFetchable), wonka.mergeMap(function(operation) {
      var key = operation.key;
      var teardown$ = wonka.pipe(sharedOps$, wonka.filter(function(op) {
        return "teardown" === op.operationName && op.key === key;
      }));
      return wonka.pipe(createFetchSource(operation), wonka.takeUntil(teardown$));
    }));
    var forward$ = wonka.pipe(sharedOps$, wonka.filter(_ref2), forward);
    return wonka.merge([ fetchResults$, forward$ ]);
  };
};

var createFetchSource = function(operation) {
  if ("subscription" === operation.operationName) {
    throw new Error("Received a subscription operation in the httpExchange. You are probably trying to create a subscription. Have you added a subscriptionExchange?");
  }
  return wonka.make(function(ref) {
    var next = ref[0];
    var complete = ref[1];
    var abortController = "undefined" != typeof AbortController ? new AbortController() : void 0;
    var context = operation.context;
    var extraOptions = "function" == typeof context.fetchOptions ? context.fetchOptions() : context.fetchOptions || {};
    function _ref3(result) {
      if (void 0 !== result) {
        next(result);
      }
      complete();
    }
    if (extraOptions.then && "function" == typeof extraOptions.then) {
      extraOptions.then(function _ref4(extraOptions) {
        var fetchOptions = _extends({
          body: JSON.stringify({
            query: graphql.print(operation.query),
            variables: operation.variables
          }),
          method: "POST"
        }, extraOptions, {
          headers: _extends({
            "content-type": "application/json"
          }, extraOptions.headers),
          signal: void 0 !== abortController ? abortController.signal : void 0
        });
        executeFetch(operation, fetchOptions).then(_ref3);
      });
    } else {
      var fetchOptions = _extends({
        body: JSON.stringify({
          query: graphql.print(operation.query),
          variables: operation.variables
        }),
        method: "POST"
      }, extraOptions, {
        headers: _extends({
          "content-type": "application/json"
        }, extraOptions.headers),
        signal: void 0 !== abortController ? abortController.signal : void 0
      });
      executeFetch(operation, fetchOptions).then(function _ref5(result) {
        if (void 0 !== result) {
          next(result);
        }
        complete();
      });
    }
    return function() {
      if (void 0 !== abortController) {
        abortController.abort();
      }
    };
  });
};

var executeFetch = function(operation, opts) {
  var response;
  return fetch(operation.context.url, opts).then(function(res) {
    checkStatus(opts.redirect, response = res);
    return response.json();
  }).then(function(result) {
    return {
      operation: operation,
      data: result.data,
      error: Array.isArray(result.errors) ? new CombinedError({
        graphQLErrors: result.errors,
        response: response
      }) : void 0
    };
  }).catch(function(err) {
    if ("AbortError" === err.name) {
      return;
    }
    return {
      operation: operation,
      data: void 0,
      error: new CombinedError({
        networkError: err,
        response: response
      })
    };
  });
};

var checkStatus = function(redirectMode, response) {
  if (void 0 === redirectMode) {
    redirectMode = "follow";
  }
  if (response.status < 200 || response.status > ("manual" === redirectMode ? 400 : 300)) {
    throw new Error(response.statusText);
  }
};

function _ref$5(ref) {
  var operationName = ref.operationName;
  if ("teardown" !== operationName && "production" !== process.env.NODE_ENV) {
    console.warn('No exchange has handled operations of type "' + operationName + "\". Check whether you've added an exchange responsible for these operations.");
  }
}

function _ref2$3() {
  return !1;
}

var fallbackExchangeIO = function(ops$) {
  return wonka.pipe(ops$, wonka.tap(_ref$5), wonka.filter(_ref2$3));
};

var composeExchanges = function(exchanges) {
  if (1 === exchanges.length) {
    return exchanges[0];
  }
  return function(ref) {
    var client = ref.client;
    return exchanges.reduceRight(function(forward, exchange) {
      return exchange({
        client: client,
        forward: forward
      });
    }, ref.forward);
  };
};

var defaultExchanges = [ dedupExchange, cacheExchange, fetchExchange ];

var createClient = function(opts) {
  return new Client(opts);
};

var Client = function Client(opts) {
  var this$1 = this;
  this.activeOperations = Object.create(null);
  this.createOperationContext = function(opts) {
    var requestPolicy = (opts || {}).requestPolicy;
    if (void 0 === requestPolicy) {
      requestPolicy = "cache-first";
    }
    return _extends({
      url: this$1.url,
      fetchOptions: this$1.fetchOptions
    }, opts, {
      requestPolicy: requestPolicy
    });
  };
  this.createRequestOperation = function(type, ref, opts) {
    return {
      key: ref.key,
      query: ref.query,
      variables: ref.variables,
      operationName: type,
      context: this$1.createOperationContext(opts)
    };
  };
  this.reexecuteOperation = function(operation) {
    if ((this$1.activeOperations[operation.key] || 0) > 0) {
      this$1.dispatchOperation(operation);
    }
  };
  this.executeQuery = function(query, opts) {
    var operation = this$1.createRequestOperation("query", query, opts);
    return this$1.executeRequestOperation(operation);
  };
  this.executeSubscription = function(query, opts) {
    var operation = this$1.createRequestOperation("subscription", query, opts);
    return this$1.executeRequestOperation(operation);
  };
  this.executeMutation = function(query, opts) {
    var operation = this$1.createRequestOperation("mutation", query, opts);
    return this$1.executeRequestOperation(operation);
  };
  this.url = opts.url;
  this.fetchOptions = opts.fetchOptions;
  this.suspense = !!opts.suspense;
  var ref = wonka.makeSubject();
  var nextOperation = ref[1];
  this.operations$ = ref[0];
  this.dispatchOperation = nextOperation;
  this.exchange = composeExchanges(void 0 !== opts.exchanges ? opts.exchanges : defaultExchanges);
  this.results$ = wonka.share(this.exchange({
    client: this,
    forward: fallbackExchangeIO
  })(this.operations$));
};

Client.prototype.onOperationStart = function onOperationStart(operation) {
  var key = operation.key;
  this.activeOperations[key] = (this.activeOperations[key] || 0) + 1;
  this.dispatchOperation(operation);
};

Client.prototype.onOperationEnd = function onOperationEnd(operation) {
  var key = operation.key;
  var prevActive = this.activeOperations[key] || 0;
  if ((this.activeOperations[key] = prevActive <= 0 ? 0 : prevActive - 1) <= 0) {
    this.dispatchOperation(_extends({}, operation, {
      operationName: "teardown"
    }));
  }
};

Client.prototype.executeRequestOperation = function executeRequestOperation(operation) {
  var this$1 = this;
  var key = operation.key;
  var operationName = operation.operationName;
  var operationResults$ = wonka.pipe(this.results$, wonka.filter(function(res) {
    return res.operation.key === key;
  }));
  if ("mutation" === operationName) {
    return wonka.pipe(operationResults$, wonka.onStart(function _ref() {
      return this$1.dispatchOperation(operation);
    }), wonka.take(1));
  }
  var result$ = wonka.pipe(operationResults$, wonka.onStart(function() {
    return this$1.onOperationStart(operation);
  }), wonka.onEnd(function() {
    return this$1.onOperationEnd(operation);
  }));
  return this.suspense ? toSuspenseSource(result$) : result$;
};

var defaultClient = createClient({
  url: "/graphql"
});

var Context = react.createContext(defaultClient);

var Provider = Context.Provider;

var Consumer = Context.Consumer;

var useImmediateState = function(init) {
  var isMounted = react.useRef(!1);
  var initialState = react.useRef(_extends({}, init));
  var ref = react.useState(initialState.current);
  var state = ref[0];
  var setState = ref[1];
  var updateState = react.useCallback(function(action) {
    if (isMounted.current) {
      setState(action);
    } else if ("function" == typeof action) {
      var update = action(initialState.current);
      _extends(initialState.current, update);
    } else {
      setState(function _ref() {
        return _extends(initialState.current, action);
      });
    }
  }, []);
  function _ref2() {
    isMounted.current = !1;
  }
  react.useEffect(function() {
    isMounted.current = !0;
    return _ref2;
  }, []);
  return [ state, updateState ];
};

var useMutation = function(query) {
  var client = react.useContext(Context);
  var ref = useImmediateState({
    fetching: !1,
    error: void 0,
    data: void 0
  });
  var setState = ref[1];
  function _ref(result) {
    setState({
      fetching: !1,
      data: result.data,
      error: result.error
    });
    return result;
  }
  return [ ref[0], react.useCallback(function(variables) {
    setState({
      fetching: !0,
      error: void 0,
      data: void 0
    });
    var request = createRequest(query, variables);
    return wonka.pipe(client.executeMutation(request), wonka.toPromise).then(_ref);
  }, [ client, query, setState ]) ];
};

var useRequest = function(query, variables) {
  var prev = react.useRef(void 0);
  return react.useMemo(function() {
    var request = createRequest(query, variables);
    if (void 0 !== prev.current && prev.current.key === request.key) {
      return prev.current;
    } else {
      prev.current = request;
      return request;
    }
  }, [ query, variables ]);
};

var LifecycleState;

!function(LifecycleState) {
  LifecycleState[LifecycleState.WillMount = 0] = "WillMount";
  LifecycleState[LifecycleState.DidMount = 1] = "DidMount";
  LifecycleState[LifecycleState.Update = 2] = "Update";
}(LifecycleState || (LifecycleState = {}));

function _ref$6(s) {
  return _extends({}, s, {
    fetching: !0
  });
}

function _ref3(s) {
  return _extends({}, s, {
    fetching: !1
  });
}

var useQuery = function(args) {
  var unsubscribe = react.useRef(noop);
  var client = react.useContext(Context);
  var ref = useImmediateState({
    fetching: !1,
    data: void 0,
    error: void 0
  });
  var state = ref[0];
  var setState = ref[1];
  var request = useRequest(args.query, args.variables);
  function _ref2(ref) {
    setState({
      fetching: !1,
      data: ref.data,
      error: ref.error
    });
  }
  var executeQuery = react.useCallback(function(opts) {
    var assign;
    unsubscribe.current();
    setState(_ref$6);
    assign = wonka.pipe(client.executeQuery(request, _extends({
      requestPolicy: args.requestPolicy
    }, opts)), wonka.subscribe(_ref2)), unsubscribe.current = assign[0];
  }, [ args.requestPolicy, client, request, setState ]);
  function _ref4() {
    return unsubscribe.current();
  }
  !function(effect, changes) {
    var teardown = react.useRef(void 0);
    var state = react.useRef(LifecycleState.WillMount);
    if (state.current === LifecycleState.WillMount) {
      state.current = LifecycleState.DidMount;
      teardown.current = effect();
    }
    react.useEffect(function() {
      if (state.current === LifecycleState.Update) {
        return teardown.current = effect();
      } else {
        state.current = LifecycleState.Update;
        return teardown.current;
      }
    }, changes);
  }(function() {
    if (args.pause) {
      unsubscribe.current();
      return setState(_ref3);
    }
    executeQuery();
    return _ref4;
  }, [ executeQuery, args.pause, setState ]);
  return [ state, executeQuery ];
};

var useSubscription = function(args, handler) {
  var unsubscribe = react.useRef(noop);
  var client = react.useContext(Context);
  var ref = useImmediateState({
    fetching: !0,
    error: void 0,
    data: void 0
  });
  var state = ref[0];
  var setState = ref[1];
  var request = useRequest(args.query, args.variables);
  function _ref(ref) {
    var data = ref.data;
    var error = ref.error;
    setState(function(s) {
      return {
        fetching: !0,
        data: void 0 !== handler ? handler(s.data, data) : data,
        error: error
      };
    });
  }
  var executeSubscription = react.useCallback(function() {
    var assign;
    unsubscribe.current();
    assign = wonka.pipe(client.executeSubscription(request), wonka.subscribe(_ref)), 
    unsubscribe.current = assign[0];
  }, [ client, handler, request, setState ]);
  function _ref2() {
    return unsubscribe.current();
  }
  react.useEffect(function() {
    executeSubscription();
    return _ref2;
  }, [ executeSubscription ]);
  return [ state ];
};

function __rest(s, e) {
  var t = {};
  for (var p in s) {
    if (Object.prototype.hasOwnProperty.call(s, p) && e.indexOf(p) < 0) {
      t[p] = s[p];
    }
  }
  if (null != s && "function" == typeof Object.getOwnPropertySymbols) {
    var i = 0;
    for (p = Object.getOwnPropertySymbols(s); i < p.length; i++) {
      if (e.indexOf(p[i]) < 0) {
        t[p[i]] = s[p[i]];
      }
    }
  }
  return t;
}

exports.Client = Client;

exports.CombinedError = CombinedError;

exports.Consumer = Consumer;

exports.Context = Context;

exports.Mutation = function Mutation(ref) {
  var children = ref.children;
  var ref$1 = useMutation(ref.query);
  return children(_extends({}, ref$1[0], {
    executeMutation: ref$1[1]
  }));
};

exports.Provider = Provider;

exports.Query = function Query(_a) {
  var children = _a.children;
  var args = __rest(_a, [ "children" ]);
  var ref = useQuery(args);
  return children(_extends({}, ref[0], {
    executeQuery: ref[1]
  }));
};

exports.Subscription = function Subscription(_a) {
  var children = _a.children;
  var handler = _a.handler;
  var args = __rest(_a, [ "children", "handler" ]);
  return children(useSubscription(args, handler)[0]);
};

exports.cacheExchange = cacheExchange;

exports.collectTypesFromResponse = collectTypesFromResponse;

exports.composeExchanges = composeExchanges;

exports.createClient = createClient;

exports.createRequest = createRequest;

exports.debugExchange = function(ref) {
  var forward = ref.forward;
  return function(ops$) {
    return wonka.pipe(ops$, wonka.tap(_ref$3), forward, wonka.tap(_ref2$2));
  };
};

exports.dedupExchange = dedupExchange;

exports.defaultExchanges = defaultExchanges;

exports.fallbackExchangeIO = fallbackExchangeIO;

exports.fetchExchange = fetchExchange;

exports.formatDocument = formatDocument;

exports.getKeyForRequest = getKeyForRequest;

exports.noop = noop;

exports.ssrExchange = function(params) {
  var data = {};
  var isCached = function(operation) {
    return !shouldSkip(operation) && void 0 !== data[operation.key];
  };
  function _ref2(op) {
    return !isCached(op);
  }
  function _ref3(op) {
    return isCached(op);
  }
  function _ref4(op) {
    return deserializeResult(op, data[op.key]);
  }
  function _ref5(result) {
    var operation = result.operation;
    if (!shouldSkip(operation)) {
      var serialized = serializeResult(result);
      data[operation.key] = serialized;
    }
  }
  function _ref6(result) {
    delete data[result.operation.key];
  }
  var ssr = function(ref) {
    var client = ref.client;
    var forward = ref.forward;
    return function(ops$) {
      var sharedOps$ = wonka.share(ops$);
      var forwardedOps$ = wonka.pipe(sharedOps$, wonka.filter(_ref2), forward);
      var cachedOps$ = wonka.pipe(sharedOps$, wonka.filter(_ref3), wonka.map(_ref4));
      if (client.suspense) {
        forwardedOps$ = wonka.pipe(forwardedOps$, wonka.tap(_ref5));
      } else {
        cachedOps$ = wonka.pipe(cachedOps$, wonka.tap(_ref6));
      }
      return wonka.merge([ forwardedOps$, cachedOps$ ]);
    };
  };
  ssr.restoreData = function(restore) {
    return _extends(data, restore);
  };
  ssr.extractData = function() {
    return _extends({}, data);
  };
  if (params && params.initialState) {
    ssr.restoreData(params.initialState);
  }
  return ssr;
};

exports.subscriptionExchange = function(ref) {
  var forwardSubscription = ref.forwardSubscription;
  function _ref(operation) {
    var observableish = forwardSubscription({
      key: operation.key.toString(36),
      query: graphql.print(operation.query),
      variables: operation.variables,
      context: _extends({}, operation.context)
    });
    return wonka.make(function(ref) {
      var next = ref[0];
      var sub = observableish.subscribe({
        next: function(result) {
          return next({
            operation: operation,
            data: result.data || void 0,
            error: Array.isArray(result.errors) ? new CombinedError({
              graphQLErrors: result.errors,
              response: void 0
            }) : void 0
          });
        },
        error: function(err) {
          return next({
            operation: operation,
            data: void 0,
            error: new CombinedError({
              networkError: err,
              response: void 0
            })
          });
        },
        complete: ref[1]
      });
      return function() {
        return sub.unsubscribe();
      };
    });
  }
  return function(ref) {
    var forward = ref.forward;
    var createSubscriptionSource = _ref;
    return function(ops$) {
      var sharedOps$ = wonka.share(ops$);
      var subscriptionResults$ = wonka.pipe(sharedOps$, wonka.filter(isSubscriptionOperation), wonka.mergeMap(function(operation) {
        var key = operation.key;
        var teardown$ = wonka.pipe(sharedOps$, wonka.filter(function(op) {
          return "teardown" === op.operationName && op.key === key;
        }));
        return wonka.pipe(createSubscriptionSource(operation), wonka.takeUntil(teardown$));
      }));
      var forward$ = wonka.pipe(sharedOps$, wonka.filter(_ref2$1), forward);
      return wonka.merge([ subscriptionResults$, forward$ ]);
    };
  };
};

exports.toSuspenseSource = toSuspenseSource;

exports.useMutation = useMutation;

exports.useQuery = useQuery;

exports.useSubscription = useSubscription;
//# sourceMappingURL=urql.js.map
