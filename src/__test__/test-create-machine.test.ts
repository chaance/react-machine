/* eslint-disable require-await */
/* eslint-disable no-sequences */

import { StateObject, EventObject, Assign } from "../types";
import { createService as createMachine } from "../service";

describe("createService", () => {
	describe("when no args are passed", () => {
		it("should create an empty machine", () => {
			// @ts-expect-error
			const machine = createMachine();
			expect(machine.state).toEqual({ name: null, context: {} });
		});
	});

	describe("when no a noop function is passed", () => {
		it("should create an empty machine", () => {
			const machine = createMachine(() => {});
			expect(machine.state).toEqual({ name: null, context: {} });
		});
	});

	describe("when no a noop function and context are both passed", () => {
		it("should create a stateless machine with context", () => {
			const machine = createMachine(() => {}, { a: 1 });
			expect(machine.state).toEqual({ name: null, context: { a: 1 } });
		});
	});

	describe("after initial transition", () => {
		type C = { a?: number; b?: number };
		const initMachine = () =>
			createMachine<C, StateObject<C>, EventObject>(
				({ state, enter }) => {
					state("foo", enter({ assign: { b: 2 } }));
				},
				{ a: 1 } as C
			);

		it("should transition to the next state", () => {
			const machine = initMachine();
			expect(machine.state.name).toBe("foo");
		});
		it("should assign context", () => {
			const machine = initMachine();
			expect(machine.state.context).toEqual({ a: 1, b: 2 });
		});
		it("should be in the final state", () => {
			const machine = initMachine();
			expect(machine.state.final).toBe(true);
		});
	});

	describe("with a transition guard", () => {
		type C = {};
		type S = { name: "a"; context: C } | { name: "b"; context: C };
		type E = { type: "go"; ok?: boolean };
		const initMachine = () =>
			createMachine<C, S, E>(({ state, transition }) => {
				state("a", transition("go", "b", { guard: (_, event) => !!event.ok }));
				state("b");
			});

		it("should start in state `a`", () => {
			const machine = initMachine();
			expect(machine.state.name).toBe("a");
		});

		describe("after firing an event that doesn't meet the guard condition", () => {
			const machine = initMachine();
			machine.send("go");
			it("should stay in state `a`", () => {
				expect(machine.state.name).toBe("a");
			});
		});

		describe("after firing an event that meets the guard condition", () => {
			const machine = initMachine();
			machine.send({ type: "go", ok: true });
			it("should move to state `b`", () => {
				expect(machine.state.name).toBe("b");
			});
		});
	});

	describe("with a transition reducer", () => {
		type C = { a: number; b?: number; c?: number };
		type S = { name: "a"; context: C } | { name: "b"; context: C };
		type E = { type: "go"; data: number };
		const initMachine = () =>
			createMachine<C, S, E>(
				({ state, transition }) => {
					state(
						"a",
						transition("go", "b", {
							reduce: (ctx, event) => ({ a: ctx.a, c: event.data }),
						})
					);
					state("b");
				},
				{ a: 1, b: 2 }
			);

		it("should start in state `a`", () => {
			const machine = initMachine();
			expect(machine.state.name).toBe("a");
		});

		describe("after sending an event with reduce", () => {
			const machine = initMachine();
			machine.send({ type: "go", data: 3 });

			it("should move to state `b`", () => {
				expect(machine.state.name).toBe("b");
			});

			it("should reduce the context as directed by the event", () => {
				expect(machine.state.context).toEqual({ a: 1, c: 3 });
			});
		});
	});

	describe("with a transition assignment", () => {
		type C = { x?: string; y?: string; z?: "foo" };
		type S = { name: "a"; context: C } | { name: "b"; context: C; final: true };
		type E = { type: "go"; x: number; y: number };

		const prefixer: Assign<C, E> = (_, evt) => {
			const r = evt;
			for (const key of Object.keys(r)) {
				// @ts-ignore
				r[key] = "prefix" + r[key];
			}
			return r as any;
		};

		const initMachine = () =>
			createMachine<C, S, E>(({ state, transition }) => {
				state(
					"a",
					transition("go", "b", {
						assign: [true, { z: "foo" }, prefixer],
					})
				);
				state("b");
			});

		const machine = initMachine();
		it("should start in state `a`", () => {
			expect(machine.state.name).toBe("a");
		});

		it("should have empty context", () => {
			expect(machine.state.context).toEqual({});
		});

		describe("after sending an event with assign", () => {
			const machine = initMachine();
			machine.send({ type: "go", x: 1, y: 2 });

			it("should move to state `b`", () => {
				expect(machine.state.name).toBe("b");
			});

			it("should update the context based on assignments", () => {
				expect(machine.state.context).toEqual({
					x: "prefix1",
					y: "prefix2",
					z: "foo",
				});
			});
		});
	});
});

// 	const machine = createMachine(({ state, transition, immediate }) => {
// 		state("a", transition("go", "b", { assign: [x, y, z] }));
// 		state("b");
// 	});

// 	t.is(machine.state.name, "a");
// 	t.deepEqual(machine.state.context, {});

// 	machine.send({ type: "go", x: 1, y: 2 });
// 	t.is(machine.state.name, "b");
// 	t.deepEqual(machine.state.context, { x: "prefix1", y: "prefix2", z: "foo" });
// });

// test("transition action", (t) => {
// 	let actionCalledWith = null;

// 	const machine = createMachine(
// 		({ state, transition }) => {
// 			state(
// 				"a",
// 				transition("go", "b", {
// 					action: (ctx, event) => {
// 						actionCalledWith = event;
// 						return { unused: 123 };
// 					},
// 				})
// 			);
// 			state("b");
// 		},
// 		{ a: 1, b: 2 }
// 	);

// 	t.deepEqual(machine.state, { name: "a", context: { a: 1, b: 2 } });

// 	machine.send({ type: "go", data: 3 });
// 	t.deepEqual(machine.state, {
// 		name: "b",
// 		context: { a: 1, b: 2 },
// 		final: true,
// 	});
// 	t.deepEqual(actionCalledWith, { type: "go", data: 3 });
// });

// test("enter guard is ignored", (t) => {
// 	const machine = createMachine(({ state, transition, enter }) => {
// 		state("a", transition("go", "b"));
// 		state("b", enter({ guard: (ctx, event) => event.ok }));
// 	});

// 	t.deepEqual(machine.state, { name: "a", context: {} });

// 	machine.send({ type: "go" });
// 	t.deepEqual(machine.state, { name: "b", context: {}, final: true });
// });

// test("enter reduce", (t) => {
// 	const machine = createMachine(
// 		({ state, transition, enter }) => {
// 			state("a", transition("go", "b"));
// 			state(
// 				"b",
// 				enter({ reduce: (ctx, event) => ({ a: ctx.a, c: event.data }) })
// 			);
// 		},
// 		{ a: 1, b: 2 }
// 	);

// 	t.deepEqual(machine.state, { name: "a", context: { a: 1, b: 2 } });

// 	machine.send({ type: "go", data: 3 });
// 	t.deepEqual(machine.state, {
// 		name: "b",
// 		context: { a: 1, c: 3 },
// 		final: true,
// 	});
// });

// test("enter assign", (t) => {
// 	const x = true;
// 	const y = { z: "foo" };
// 	const z = (ctx, d) => {
// 		for (const key of Object.keys(d)) {
// 			d[key] = "prefix" + d[key];
// 		}
// 		return d;
// 	};

// 	const machine = createMachine(({ state, transition, enter }) => {
// 		state("a", transition("go", "b"));
// 		state("b", enter({ assign: [x, y, z] }));
// 	});

// 	t.is(machine.state.name, "a");
// 	t.deepEqual(machine.state.context, {});

// 	machine.send({ type: "go", x: 1, y: 2 });
// 	t.is(machine.state.name, "b");
// 	t.deepEqual(machine.state.context, { x: "prefix1", y: "prefix2", z: "foo" });
// });

// test("enter action", (t) => {
// 	let actionCalledWith = null;

// 	const machine = createMachine(
// 		({ state, transition, enter }) => {
// 			state("a", transition("go", "b"));
// 			state(
// 				"b",
// 				enter({
// 					action: (ctx, event) => {
// 						actionCalledWith = event;
// 						return { unused: 123 };
// 					},
// 				})
// 			);
// 		},
// 		{ a: 1, b: 2 }
// 	);

// 	t.deepEqual(machine.state, { name: "a", context: { a: 1, b: 2 } });

// 	machine.send({ type: "go", data: 3 });
// 	t.deepEqual(machine.state, {
// 		name: "b",
// 		context: { a: 1, b: 2 },
// 		final: true,
// 	});
// 	t.deepEqual(actionCalledWith, { type: "go", data: 3 });
// });

// test("enter invoke", async (t) => {
// 	const machine = createMachine(({ state, transition, immediate, enter }) => {
// 		state("a", transition("go", "b"));
// 		state(
// 			"b",
// 			enter({ invoke: save }),
// 			transition("done", "c", { assign: [true, { error: null }] }),
// 			transition("error", "a", { assign: true })
// 		);
// 		state("c");
// 	});

// 	async function save(context) {
// 		if (context.error) return { id: 1, name: "hello" };
// 		throw new Error("Fails the first time");
// 	}

// 	t.deepEqual(machine.state, { name: "a", context: {} });

// 	machine.send("go");

// 	t.deepEqual(machine.state, { name: "b", context: {} });

// 	while (!machine.state.context.error) {
// 		await new Promise((resolve) => setTimeout(resolve), 4);
// 	}

// 	t.is(machine.state.name, "a");
// 	t.is(machine.state.context.error.message, "Fails the first time");

// 	machine.send("go");

// 	while (machine.state.context.error) {
// 		await new Promise((resolve) => setTimeout(resolve), 4);
// 	}

// 	t.is(machine.state.name, "c");
// 	t.deepEqual(machine.state, {
// 		name: "c",
// 		context: {
// 			data: { id: 1, name: "hello" },
// 			error: null,
// 		},
// 		final: true,
// 	});
// });

// test("enter effect", async (t) => {
// 	const machine = createMachine(({ state, transition, immediate, enter }) => {
// 		state("a", transition("go", "b"));
// 		state(
// 			"b",
// 			enter({ effect: save }),
// 			transition("done", "c", { assign: [true, { error: null }] }),
// 			transition("error", "a", { assign: true })
// 		);
// 		state("c");
// 	});

// 	function save(context, event, send) {
// 		Promise.resolve("defer").then(() => {
// 			if (context.error)
// 				return send({ type: "done", data: { id: 1, name: "hello" } });
// 			send({ type: "error", error: new Error("Fails the first time") });
// 		});
// 	}

// 	t.deepEqual(machine.state, { name: "a", context: {} });

// 	machine.send("go");

// 	t.deepEqual(machine.state, { name: "b", context: {} });

// 	while (!machine.state.context.error) {
// 		await new Promise((resolve) => setTimeout(resolve), 4);
// 	}

// 	t.is(machine.state.name, "a");
// 	t.is(machine.state.context.error.message, "Fails the first time");

// 	machine.send("go");

// 	while (machine.state.context.error) {
// 		await new Promise((resolve) => setTimeout(resolve), 4);
// 	}

// 	t.is(machine.state.name, "c");
// 	t.deepEqual(machine.state, {
// 		name: "c",
// 		context: {
// 			data: { id: 1, name: "hello" },
// 			error: null,
// 		},
// 		final: true,
// 	});
// });

// test("exit guard is ignored", (t) => {
// 	const machine = createMachine(({ state, transition, exit }) => {
// 		state(
// 			"a",
// 			transition("go", "b"),
// 			exit({ guard: (ctx, event) => event.ok })
// 		);
// 		state("b");
// 	});

// 	t.deepEqual(machine.state, { name: "a", context: {} });

// 	machine.send({ type: "go" });
// 	t.deepEqual(machine.state, { name: "b", context: {}, final: true });
// });

// test("exit reduce", (t) => {
// 	const machine = createMachine(
// 		({ state, transition, exit }) => {
// 			state(
// 				"a",
// 				transition("go", "b"),
// 				exit({ reduce: (ctx, event) => ({ a: ctx.a, c: event.data }) })
// 			);
// 			state("b");
// 		},
// 		{ a: 1, b: 2 }
// 	);

// 	t.deepEqual(machine.state, { name: "a", context: { a: 1, b: 2 } });

// 	machine.send({ type: "go", data: 3 });
// 	t.deepEqual(machine.state, {
// 		name: "b",
// 		context: { a: 1, c: 3 },
// 		final: true,
// 	});
// });

// test("exit assign", (t) => {
// 	const x = true;
// 	const y = { z: "foo" };
// 	const z = (ctx, d) => {
// 		for (const key of Object.keys(d)) {
// 			d[key] = "prefix" + d[key];
// 		}
// 		return d;
// 	};

// 	const machine = createMachine(({ state, transition, exit }) => {
// 		state("a", transition("go", "b"), exit({ assign: [x, y, z] }));
// 		state("b");
// 	});

// 	t.is(machine.state.name, "a");
// 	t.deepEqual(machine.state.context, {});

// 	machine.send({ type: "go", x: 1, y: 2 });
// 	t.is(machine.state.name, "b");
// 	t.deepEqual(machine.state.context, { x: "prefix1", y: "prefix2", z: "foo" });
// });

// test("simple machine", (t) => {
// 	const machine = createMachine(({ state, transition }) => {
// 		state("initial", transition("go", "final"));
// 		state("final");
// 	});

// 	// machine structure
// 	t.deepEqual(machine.machine, {
// 		states: {
// 			initial: {
// 				name: "initial",
// 				enter: [],
// 				exit: [],
// 				transitions: {
// 					go: [
// 						{
// 							type: "transition",
// 							event: "go",
// 							target: "final",
// 							guards: [],
// 							reducers: [],
// 						},
// 					],
// 				},
// 				immediates: [],
// 			},
// 			final: {
// 				name: "final",
// 				enter: [],
// 				exit: [],
// 				transitions: {},
// 				immediates: [],
// 			},
// 		},
// 	});

// 	t.deepEqual(machine.runningEffects, []);
// 	t.deepEqual(machine.pendingEffects, []);
// 	t.is(typeof machine.subscribe, "function");
// 	t.is(typeof machine.send, "function");
// 	t.is(typeof machine.stop, "function");

// 	t.deepEqual(Object.keys(machine), [
// 		"machine",
// 		"state",
// 		"prev",
// 		"pendingEffects",
// 		"runningEffects",
// 		"send",
// 		"subscribe",
// 		"stop",
// 	]);

// 	t.deepEqual(machine.state, {
// 		name: "initial",
// 		context: {},
// 	});

// 	t.is(machine.state.name, "initial");
// 	t.is(machine.state.final, undefined);

// 	machine.send("go");
// 	t.is(machine.state.name, "final");
// 	t.is(machine.state.final, true);
// });

// test("complex machine", (t) => {
// 	const set = (key, val) => (ctx) => ((ctx[key] = val), ctx);
// 	const assign = (ctx, { type, ...data }) => ({ ...ctx, ...data });

// 	const machine = createMachine(
// 		({ state, transition, internal, immediate, enter, exit }) => {
// 			state("initial", transition("goToSecond", "second", { reduce: assign }));
// 			state("second", immediate("third"));
// 			state(
// 				"third",
// 				immediate("final", { guard: () => false }),
// 				transition("goToFourth", "fourth", { reduce: assign })
// 			);
// 			state(
// 				"fourth",
// 				enter({ effect: ping }),
// 				internal("assign", { reduce: assign }),
// 				transition("goToFinal", "final", { reduce: assign }),
// 				exit({ assign: { fourthExited: "pong" } })
// 			);
// 			state("final", enter({ reduce: set("y", 2) }));
// 		}
// 	);

// 	function ping(context, event, send) {
// 		t.deepEqual(context, { x: 2 });
// 		t.deepEqual(event, { type: "goToFourth", x: 2 });
// 		send({ type: "assign", fourthEntered: "ping" });
// 		return () => {
// 			// check that we have stale context
// 			t.deepEqual(context, { x: 2 });

// 			const stubbed = stub(console, "warn");
// 			send("ping");
// 			stubbed.restore();

// 			t.is(stubbed.calls.length, 1);
// 			t.deepEqual(stubbed.calls[0], [
// 				[
// 					"Can't send events in an effect after it has been cleaned up.",
// 					"This is a no-op, but indicates a memory leak in your application.",
// 					"To fix, cancel all subscriptions and asynchronous tasks in the effect's cleanup function.",
// 				].join(" "),
// 			]);
// 		};
// 	}

// 	t.is(machine.state.name, "initial");
// 	t.deepEqual(machine.state.context, {});
// 	machine.send({ type: "goToSecond", x: 1 });
// 	t.is(machine.state.name, "third");
// 	t.deepEqual(machine.state.context, { x: 1 });

// 	machine.send({ type: "goToFourth", x: 2 });
// 	t.is(machine.state.name, "fourth");
// 	t.deepEqual(machine.state.context, { x: 2, fourthEntered: "ping" });

// 	machine.send({ type: "goToFinal", x: 3 });
// 	t.is(machine.state.name, "final");
// 	t.deepEqual(machine.state.context, {
// 		x: 3,
// 		y: 2,
// 		fourthEntered: "ping",
// 		fourthExited: "pong",
// 	});
// 	t.is(machine.state.final, true);
// });

// test("throw an error if state is passed an incorrect argument", (t) => {
// 	const err = t.throws(() =>
// 		createMachine(({ state, enter }) => {
// 			state("foo", { assign: { b: 2 } });
// 		})
// 	);
// 	t.is(
// 		err.message,
// 		"State 'foo' should be passed one of enter(), exit(), transition(), immediate() or internal()"
// 	);
// });

// test("throw an error if transition specifies an invalid target", (t) => {
// 	const err1 = t.throws(() =>
// 		createMachine(({ state, transition }) => {
// 			state("foo", transition("next", "bar"));
// 		})
// 	);
// 	t.is(err1.message, "Invalid transition target 'bar'");

// 	const err2 = t.throws(() =>
// 		createMachine(({ state, immediate }) => {
// 			state("foo", immediate("bar"));
// 		})
// 	);
// 	t.is(err2.message, "Invalid transition target 'bar'");
// });

// test("throw an error if transition arguments are incorrect", (t) => {
// 	const err1 = t.throws(() =>
// 		createMachine(({ state, transition }) => {
// 			state("foo", transition(1));
// 		})
// 	);
// 	t.is(
// 		err1.message,
// 		"First argument of the transition must be the name of the event"
// 	);

// 	const err2 = t.throws(() =>
// 		createMachine(({ state, transition }) => {
// 			state("foo", transition("1", 2));
// 		})
// 	);
// 	t.is(
// 		err2.message,
// 		"Second argument of the transition must be the name of the target state"
// 	);
// });

// test("service subscriptions", (t) => {
// 	let active = null;

// 	const machine = createMachine(({ state, enter, internal }) => {
// 		state(
// 			"one",
// 			enter({
// 				effect: () => {
// 					active = true;
// 					return () => {
// 						active = false;
// 					};
// 				},
// 			}),
// 			internal("assign", { assign: true })
// 		);
// 	});

// 	const subs = [];

// 	const dispose = machine.subscribe((curr) => {
// 		subs.push({ sub: "sub1", context: curr.context });
// 	});

// 	machine.subscribe((curr) => {
// 		subs.push({ sub: "sub2", context: curr.context });
// 	});

// 	t.is(active, true);

// 	t.deepEqual(machine.state, { name: "one", context: {} });

// 	machine.send({ type: "assign", a: 1 });
// 	t.deepEqual(machine.state, { name: "one", context: { a: 1 } });

// 	t.deepEqual(subs, [
// 		{ sub: "sub1", context: { a: 1 } },
// 		{ sub: "sub2", context: { a: 1 } },
// 	]);

// 	dispose();

// 	machine.send({ type: "assign", a: 2 });
// 	t.deepEqual(machine.state, { name: "one", context: { a: 2 } });

// 	t.deepEqual(subs, [
// 		{ sub: "sub1", context: { a: 1 } },
// 		{ sub: "sub2", context: { a: 1 } },
// 		{ sub: "sub2", context: { a: 2 } },
// 	]);

// 	machine.stop();

// 	machine.send({ type: "assign", a: 3 });
// 	t.deepEqual(machine.state, { name: "one", context: { a: 2 } });
// });

// function stub(obj, fn) {
// 	const original = obj[fn];
// 	const calls = [];
// 	obj[fn] = (...args) => {
// 		calls.push(args);
// 	};
// 	return {
// 		restore: () => {
// 			obj[fn] = original;
// 		},
// 		calls,
// 	};
// }
