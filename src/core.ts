import { HOOK_KEYS } from "./constants";
import warning from "tiny-warning";
import {
	TransitionOptions,
	Effect,
	Enter,
	EnterOptions,
	MachineDescription,
	HookType,
	ValueOf,
	ExitOptions,
	MachineState,
	Transition,
	Immediate,
	Internal,
	Exit,
	Machine,
	EventObject,
	StateObject,
	SendFunction,
} from "./types";

const transitionHooks: ["assign", "reduce", "action", "guard"] = [
	"assign",
	"reduce",
	"action",
	"guard",
];
const enterHooks: ["assign", "reduce", "action", "invoke", "effect"] = [
	"assign",
	"reduce",
	"action",
	"invoke",
	"effect",
];
const exitHooks: ["assign", "reduce", "action"] = [
	"assign",
	"reduce",
	"action",
];

const mappedHooks: MappedHooks = {
	assign: ["reduce", assignToReduce],
	action: ["reduce", actionToReduce],
};

const ACTION = {};

function assertString(
	argument: any,
	error: string
): asserts argument is string {
	if (typeof argument !== "string") {
		throw new Error(error);
	}
}

/**
 * Parse the machine DSL into a machine object.
 */
export function createMachine<
	ContextType extends object,
	StateType extends StateObject<ContextType>,
	EventType extends EventObject
>(create?: MachineDescription<ContextType, StateType, EventType>) {
	const machine: Machine<ContextType, StateType> = {
		states: {} as any,
	};

	if (create) {
		create({
			state: (name, ...opts) => {
				const state = createState(name, ...opts);
				machine.states[name as keyof StateType] = state;
				return state;
			},
			enter: createEnter,
			exit: createExit,
			transition: createTransition,
			immediate: createImmediate,
			internal: createInternal,
		});
	}

	validate(machine);

	return machine;
}

function validate<
	ContextType extends object,
	StateType extends StateObject<ContextType>
>(machine: Machine<ContextType, StateType>) {
	for (const [, state] of Object.entries<MachineState>(machine.states)) {
		if (state.immediates) {
			for (const transition of state.immediates) {
				if (!(machine.states as any)[transition.target]) {
					throw new Error(`Invalid transition target '${transition.target}'`);
				}
			}
		}

		for (const [, transitions] of Object.entries(state.transitions)) {
			for (const transition of transitions) {
				if (
					!isInternal(transition) &&
					!(machine.states as any)[transition.target]
				) {
					throw new Error(`Invalid transition target '${transition.target}'`);
				}
			}
		}
	}
}

/**
 * Create a state node.
 */
function createState(
	name: string,
	...opts: (Transition | Immediate | Internal | Enter | Exit)[]
): MachineState {
	const enter: Enter[] = [];
	const exit: Exit[] = [];
	const transitions: Record<string, Transition[]> = {};
	const immediates: Immediate[] = [];

	for (const opt of opts) {
		let event: string | undefined;
		if ("event" in opt) {
			event = opt.event;
		}
		const { type } = opt;
		if (type === "transition") {
			if (!transitions[event!]) {
				transitions[event!] = [];
			}
			transitions[event!].push(opt as Transition);
		} else if (type === "immediate") {
			immediates.push(opt as Immediate);
		} else if (type === "enter") {
			enter.push(opt as Enter);
		} else if (type === "exit") {
			exit.push(opt as Exit);
		} else {
			throw new Error(
				`State '${name}' should be passed one of enter(), exit(), transition(), immediate() or internal()`
			);
		}
	}

	return {
		name,
		enter,
		exit,
		transitions,
		immediates,
	};
}

function createEnter<ContextType extends object, EventType extends EventObject>(
	opts: EnterOptions<ContextType, EventType>
): Enter {
	return {
		type: "enter",
		...merge(opts, enterHooks),
	};
}

function createExit<ContextType extends object, EventType extends EventObject>(
	opts: ExitOptions<ContextType, EventType>
): Exit {
	return {
		type: "exit",
		...merge(opts, exitHooks),
	};
}

function createTransition<
	ContextType extends object,
	EventType extends EventObject
>(
	event: string,
	target: string,
	opts: TransitionOptions<ContextType, EventType>
): Transition {
	assertString(
		event,
		"First argument of the transition must be the name of the event"
	);
	assertString(
		target,
		"Second argument of the transition must be the name of the target state"
	);
	return {
		type: "transition",
		event,
		target,
		...merge(opts, transitionHooks),
	};
}

function createInternal<
	ContextType extends object,
	EventType extends EventObject
>(event: string, opts: TransitionOptions<ContextType, EventType>): Internal {
	assertString(
		event,
		"First argument of the internal transition must be the name of the event"
	);
	return {
		type: "transition",
		event,
		internal: true,
		...merge(opts, transitionHooks),
	};
}

function createImmediate<
	ContextType extends object,
	EventType extends EventObject
>(target: string, opts: TransitionOptions<ContextType, EventType>): Immediate {
	assertString(
		target,
		"First argument of the immediate transition must be the name of the target state"
	);
	return {
		type: "immediate",
		target,
		...merge(opts, transitionHooks),
	};
}

/**
 * Transition the given machine, with the given state
 * to the next state based on the event. Returns the tuple
 * of the next state and any events to execute. In case no external
 * transition took place, return null as effects, to indicate
 * that the active effects should continue running.
 */
export function transition<
	ContextType extends object,
	StateType extends StateObject<ContextType>,
	EventType extends EventObject
>(
	machine: Machine<ContextType, StateType>,
	state: StateType,
	event: EventType | EventType["type"]
): [next: StateType, effects: Effect<ContextType, EventType>[] | null] {
	const eventObj = toEventObject(event);

	// initial transition
	if (!state.name && eventObj && eventObj.type === null) {
		const stateNames = Object.keys(machine.states);
		if (stateNames.length > 0) {
			const initialStateName = stateNames[0];
			const initialTransition = createImmediate(initialStateName, {});
			return applyTransition(machine, state, eventObj, initialTransition);
		}
	}

	const currState: MachineState =
		machine.states[state.name as keyof StateType] || {};
	const transitions = currState.transitions || {};
	const candidates = transitions[eventObj.type] || [];

	for (const candidate of candidates) {
		if (checkGuards(state.context, eventObj, candidate)) {
			return applyTransition(machine, state, eventObj, candidate);
		}
	}

	return [state, null];
}

/**
 * The logic of applying a transition to the machine. Exit states,
 * apply transition hooks, enter states and collect any events. Do this
 * recursively untill all immediate transitions settle.
 */
function applyTransition<
	ContextType extends object,
	StateType extends StateObject<ContextType>,
	EventType extends EventObject
>(
	machine: Machine<ContextType, StateType>,
	curr: StateType,
	event: EventType,
	transition: Transition | Internal | Immediate
): [next: StateType, effects: Effect<ContextType, EventType>[] | null] {
	const next = { ...curr };
	const currentName = curr.name as keyof StateType;
	const target = isInternal(transition)
		? currentName
		: (transition.target as keyof StateType);
	const currState = machine.states[currentName];
	const nextState = machine.states[target];
	const effects = isInternal(transition)
		? null
		: ([] as Effect<ContextType, EventType>[]);

	if (currState && !isInternal(transition)) {
		for (const exit of currState.exit) {
			applyReducers(next, event, exit.reducers);
		}
	}

	next.name = target as string;

	applyReducers(next, event, transition.reducers);

	if (!isInternal(transition)) {
		for (const enter of nextState.enter) {
			applyReducers(next, event, enter.reducers);
		}
	}

	if (nextState.immediates) {
		for (const candidate of nextState.immediates) {
			if (checkGuards(next.context, event, candidate)) {
				return applyTransition(machine, next, event, candidate);
			}
		}
	}

	if (
		Object.keys(nextState.transitions).length === 0 &&
		nextState.immediates?.length === 0
	) {
		next.final = true;
	}

	if (!isInternal(transition)) {
		for (const enter of nextState.enter) {
			// @ts-ignore
			if (enter.invokes) {
				// @ts-ignore
				for (const invoke of enter.invokes) {
					effects!.push({ run: promiseEffect(invoke), event });
				}
			}

			for (const effect of enter.effects) {
				effects!.push({ run: effect, event });
			}
		}
	}

	return [next, effects];
}

function checkGuards<ContextType extends object, EventType extends EventObject>(
	context: ContextType,
	event: EventType,
	transition: Transition | Immediate
) {
	return (
		!transition.guards.length ||
		transition.guards.every((g) => g(context, event))
	);
}

function applyReducers<
	ContextType extends object,
	StateType extends StateObject<ContextType>,
	EventType extends EventObject
>(
	next: StateType,
	event: EventType,
	reducers: ((context: ContextType, event: EventType) => ContextType)[]
) {
	for (const reduce of reducers) {
		const result = reduce(next.context, event);
		if (result !== ACTION) {
			next.context = result;
		}
	}
}

/**
 * A common operation is to assign event payload
 * to the context, this allows to do in several ways:
 * true - assign the full event payload to context
 * fn - assign the result of the fn(context, data) to context
 * val - assign the constant provided value to context
 */
function assignToReduce<
	ContextType extends object,
	EventType extends EventObject
>(
	assign:
		| true
		| ((
				context: ContextType,
				data: Pick<EventType, Exclude<keyof EventType, "type">>
		  ) => any)
		| ContextType
): (context: ContextType, event: EventType) => ContextType {
	return (context, event) => {
		const { type, ...data } = event;

		if (assign === true) {
			return { ...context, ...data };
		}

		if (isFunction(assign)) {
			return { ...context, ...assign(context, data) };
		}

		return { ...context, ...assign };
	};
}

function actionToReduce<ContextType, EventType extends EventObject>(
	action: (context: ContextType, event: EventType) => any
): (context: ContextType, event: EventType) => typeof ACTION {
	return (context, event) => {
		action(context, event);
		return ACTION;
	};
}

/**
 * Allow to pass each hook as a function, or a list of functions
 *   transition(..., { reduce: fn })
 *   transition(..., { reduce: [fn1, fn2] })
 * Convert both of those into arrays, and also remap some of the
 * hooks to different hooks (i.e. assign -> reduce)
 */
function merge<
	OptsType extends {
		[key in HookType]?: any;
	}
>(opts: OptsType | undefined = {} as any, allowedHooks: HookType[]) {
	const merged: { [key in ValueOf<typeof HOOK_KEYS>]: any[] } = {} as any;

	for (const hook of allowedHooks) {
		add(hook);
	}

	function add(hook: HookType) {
		let opt = toArray(opts[hook] || []);

		if (isMappedHook(hook)) {
			const [newName, transform] = mappedHooks[hook];
			hook = newName;
			opt = opt.map(transform);
		}

		const key = HOOK_KEYS[hook];

		if (key) {
			merged[key] = toArray(merged[key] || []).concat(opt);
		}
	}

	return merged;
}

/**
 * Convert an async function into an effect
 * that sends 'done' and 'error' events
 */
function promiseEffect<
	ContextType extends object,
	EventType extends EventObject
>(fn: (context: ContextType, event: EventType) => Promise<any>) {
	return (
		context: ContextType,
		event: EventType,
		send: SendFunction<EventType>
	) => {
		let disposed = false;
		Promise.resolve(fn(context, event))
			.then((data) => {
				if (!disposed) {
					send({ type: "done", data } as any);
				}
			})
			.catch((error) => {
				if (!disposed) {
					send({ type: "error", error } as any);
				}
			});
		return () => {
			disposed = true;
		};
	};
}

/**
 * createMachine and transition are pure, stateless functions. After
 * transitioning the machine to the next state, the caller must clean
 * up all of the running effects, and then run the newly provided effects.
 */
export function runEffects<
	ContextType extends object,
	StateType extends StateObject<ContextType>,
	EventType extends EventObject
>(
	effects: Effect<ContextType, EventType>[] = [],
	state: StateType,
	send: SendFunction<EventType>
) {
	const runningEffects = [];

	for (const effect of effects) {
		const safeSend: typeof send = (...args) => {
			if ((effect as any).disposed) {
				warning(
					false,
					[
						"Can't send events in an effect after it has been cleaned up.",
						"This is a no-op, but indicates a memory leak in your application.",
						"To fix, cancel all subscriptions and asynchronous tasks in the effect's cleanup function.",
					].join(" ")
				);
			} else {
				return send(...args);
			}
		};

		const dispose = effect.run(state.context, effect.event, safeSend);

		if (dispose && "then" in dispose) {
			warning(
				false,
				[
					"Effect function must return a cleanup function or nothing.",
					"Use invoke instead of effect for async functions, or call the async function inside the synchronous effect function.",
				].join(" ")
			);
		} else if (dispose) {
			effect.dispose = () => {
				(effect as any).disposed = true;
				return dispose();
			};
			runningEffects.push(effect);
		}
	}

	return runningEffects;
}

export function cleanEffects<
	ContextType extends object,
	EventType extends EventObject
>(
	runningEffects: Effect<ContextType, EventType>[] = []
): Effect<ContextType, EventType>[] {
	for (const effect of runningEffects) {
		effect.dispose?.();
	}
	return [];
}

function toArray<T>(value: T | T[]): T[] {
	return Array.isArray(value) ? value : [value];
}

function toEventObject<EventType extends EventObject>(
	event: EventType | EventType["type"]
): EventType {
	return typeof event === "string" ? ({ type: event } as EventType) : event;
}

function isFunction(value: any): value is Function {
	return !!(value && {}.toString.call(value) == "[object Function]");
}

function isInternal(
	transition: Transition | Internal | Immediate | Enter | Exit
): transition is Internal {
	return "internal" in transition;
}

type MappedHooks = {
	assign: ["reduce", typeof assignToReduce];
	action: ["reduce", typeof actionToReduce];
};

function isMappedHook(hook: HookType): hook is keyof MappedHooks {
	return hook in mappedHooks;
}
