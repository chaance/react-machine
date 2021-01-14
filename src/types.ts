export type EventType = string;
export type MetaObject = Record<string, any>;

export interface EventObject {
	type: string;
}

export type Event<EventType extends EventObject> =
	| EventType["type"]
	| EventType;

export interface StateObject<ContextType extends object> {
	name: string;
	context: ContextType;
	final?: true;
}

export interface MachineOptions {
	assign: string | boolean;
	deps: any[];
}

export interface Service<
	ContextType extends object,
	StateType extends StateObject<ContextType>,
	EventType extends EventObject
> {
	machine: Machine<ContextType, StateType>;
	state: StateType;
	prev: null | StateType;
	pendingEffects: Effect<ContextType, EventType>[];
	runningEffects: Effect<ContextType, EventType>[];
	send: SendFunction<EventType>;
	subscribe(fn: (...args: any) => any): () => void;
	stop(): void;
}

export type MachineDescription<
	ContextType extends object,
	StateType extends StateObject<ContextType>,
	EventType extends EventObject
> = ({
	state,
	transition,
	immediate,
	internal,
	enter,
	exit,
}: {
	state: StateFunction<ContextType, StateType>;
	transition: TransitionFunction<ContextType, StateType, EventType>;
	immediate: ImmediateFunction<ContextType, StateType, EventType>;
	internal: InternalTransitionFunction<ContextType, EventType>;
	enter: EnterFunction<ContextType, EventType>;
	exit: ExitFunction<ContextType, EventType>;
}) => any;

export type StateFunction<
	ContextType extends object,
	StateType extends StateObject<ContextType>
> = (
	name: StateType["name"],
	...opts: (Transition | Immediate | Internal | Enter | Exit)[]
) => MachineState;

/**
 * A `transition` function is used to move from one state to another.
 *
 * @param event - This will give the name of the event that triggers this transition.
 * @param target - The name of the destination state.
 * @param opts - Transition hooks, one of reduce, assign, guard or action.
 */
export type TransitionFunction<
	ContextType extends object,
	StateType extends StateObject<ContextType>,
	EventType extends EventObject
> = (
	event: EventType["type"],
	target: StateType["name"],
	opts: TransitionOptions<ContextType, EventType>
) => Transition;

export type InternalTransitionFunction<
	ContextType extends object,
	EventType extends EventObject
> = (
	event: string,
	opts: TransitionOptions<ContextType, EventType>
) => Internal;

/**
 * An `immediate` transition is triggered immediately upon entering the state.
 *
 * @param target - The name of the destination state.
 * @param opts - Transition hooks, one of reduce, assign, guard or action.
 */
export type ImmediateFunction<
	ContextType extends object,
	StateType extends StateObject<ContextType>,
	EventType extends EventObject
> = (
	target: StateType["name"],
	opts: TransitionOptions<ContextType, EventType>
) => Immediate;

/**
 * An `internal` transition will re-enter the same state, but without re-runing enter/exit hooks.
 *
 * @param event - This will give the name of the event that triggers this transition.
 * @param opts - Transition hooks, one of reduce, assign, guard or action.
 */
export type InternalFunction<
	ContextType extends object,
	EventType extends EventObject
> = (
	target: string,
	opts: TransitionOptions<ContextType, EventType>
) => Internal;

export type EnterFunction<
	ContextType extends object,
	EventType extends EventObject
> = (opts: EnterOptions<ContextType, EventType>) => Enter;

export type ExitFunction<
	ContextType extends object,
	EventType extends EventObject
> = (opts: ExitOptions<ContextType, EventType>) => Exit;

export interface MachineState {
	name: string;
	transitions: Record<string, Transition[]>;
	immediates?: Immediate[];
	enter: Enter[];
	exit: Exit[];
	final?: true;
}

export interface Transition {
	type: "transition";
	event: string;
	target: string;
	guards: any[];
	reducers: any[];
}

export interface Immediate {
	type: "immediate";
	target: string;
	guards: any[];
	reducers: any[];
}

export interface Internal {
	type: "transition";
	internal: true;
	event: string;
	guards: any[];
	reducers: any[];
}

export interface Enter {
	type: "enter";
	reducers: any[];
	effects: any[];
}

export interface Exit {
	type: "exit";
	reducers: any[];
	effects: any[];
}

export interface TransitionOptions<C extends object, E extends EventObject> {
	guard?: GuardFunction<C, E> | GuardFunction<C, E>[];
	reduce?: ReduceFunction<C, E> | ReduceFunction<C, E>[];
	assign?: Assign<C, E> | Assign<C, E>[];
	action?: ActionFunction<C, E> | ActionFunction<C, E>[];
}

export interface EnterOptions<C extends object, E extends EventObject> {
	effect?: EffectFunction<C, E> | EffectFunction<C, E>[];
	invoke?: InvokeFunction<C, E> | InvokeFunction<C, E>[];
	reduce?: ReduceFunction<C, E> | ReduceFunction<C, E>[];
	assign?: Assign<C, E> | Assign<C, E>[];
	action?: ActionFunction<C, E> | ActionFunction<C, E>[];
}

export interface ExitOptions<C extends object, E extends EventObject> {
	reduce?: ReduceFunction<C, E> | ReduceFunction<C, E>[];
	assign?: Assign<C, E> | Assign<C, E>[];
	action?: ActionFunction<C, E> | ActionFunction<C, E>[];
}

export type ReduceFunction<
	ContextType extends object,
	EventType extends EventObject
> = (context: ContextType, event: EventType) => ContextType;

export type ActionFunction<ContextType extends object, EventType> = (
	context: ContextType,
	event: EventType
) => unknown;

export type GuardFunction<ContextType extends object, EventType> = (
	context: ContextType,
	event: EventType
) => boolean;

export type Assign<ContextType extends object, EventType> =
	| true
	| Partial<ContextType>
	| ((context: ContextType, event: EventType) => Partial<ContextType>);

export type InvokeFunction<ContextType extends object, EventType> = (
	context: ContextType,
	event: EventType
) => Promise<any>;

export type EffectFunction<ContextType extends object, EventType> = (
	context: ContextType,
	event: EventType
) => CleanupFunction | void;

export type CleanupFunction = () => void;

export type SendFunction<EventType extends EventObject> = (
	event: EventType | EventType["type"]
) => void;

export interface HookKeys {
	guard: "guards";
	reduce: "reducers";
	effect: "effects";
	invoke: "invokes";
}

export type HookType =
	| "assign"
	| "reduce"
	| "action"
	| "guard"
	| "invoke"
	| "effect";

export type ValueOf<T> = T[keyof T];

export type Machine<
	ContextType extends object,
	StateType extends StateObject<ContextType>
> = {
	states: { [key in keyof StateType]: MachineState };
};

export type Effect<
	ContextType extends object,
	EventType extends EventObject
> = {
	run: (
		curr: ContextType,
		event: EventType,
		send: SendFunction<EventType>
	) => (() => void) | void;
	event: EventType;
	dispose?: () => any;
};
