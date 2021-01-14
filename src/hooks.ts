import * as React from "react";
import { createMachine, transition, runEffects, cleanEffects } from "./core";

import {
	EventObject,
	MachineDescription,
	MachineOptions,
	SendFunction,
	StateObject,
	Machine,
	Effect,
} from "./types";

const ASSIGN = "assign";

function initial<
	ContextType extends object,
	StateType extends StateObject<ContextType>,
	EventType extends EventObject
>({
	context,
	machine,
}: {
	context: ContextType;
	machine: Machine<ContextType, StateType>;
}): {
	machine: Machine<ContextType, StateType>;
	effects: Effect<ContextType, EventType>[];
	state: StateType;
} {
	const initialState = { context } as any;
	const initialEvent = { type: null } as any;

	const [state, effects] = transition<ContextType, StateType, EventType>(
		machine,
		initialState,
		initialEvent
	);

	const curr = {
		machine,
		effects: effects || [],
		state,
	};

	return curr;
}

type ReducerState<
	ContextType extends object,
	StateType extends StateObject<ContextType>,
	EventType extends EventObject
> = {
	state: StateType;
	effects: Effect<ContextType, EventType>[] | null;
	context: ContextType;
	machine: Machine<ContextType, StateType>;
};

type ReducerAction<
	ContextType extends object,
	StateType extends StateObject<ContextType>,
	EventType extends EventObject
> = {
	type: "send";
	event: EventType | EventType["type"];
	machine: Machine<ContextType, StateType>;
};

type ReducerType<
	ContextType extends object,
	StateType extends StateObject<ContextType>,
	EventType extends EventObject
> = (
	curr: ReducerState<ContextType, StateType, EventType>,
	action: ReducerAction<ContextType, StateType, EventType>
) => ReducerState<ContextType, StateType, EventType>;

function reducer<
	ContextType extends object,
	StateType extends StateObject<ContextType>,
	EventType extends EventObject
>(
	curr: ReducerState<ContextType, StateType, EventType>,
	action: ReducerAction<ContextType, StateType, EventType>
): ReducerState<ContextType, StateType, EventType> {
	if (action.type === "send") {
		const { event, machine } = action;
		const [state, effects] = transition<ContextType, StateType, EventType>(
			machine,
			curr.state,
			event
		);
		return { ...curr, state, effects: effects || curr.effects };
	}
	return curr;
}

export function useMachine<
	ContextType extends object,
	StateType extends StateObject<ContextType>,
	EventType extends EventObject
>(
	create: MachineDescription<ContextType, StateType, EventType>,
	context: ContextType = {} as ContextType,
	options: MachineOptions = { assign: ASSIGN, deps: [] }
): [
	state: StateType,
	send: SendFunction<EventType>,
	machine: Machine<ContextType, StateType>
] {
	const machine = useConstant(() =>
		createMachine<ContextType, StateType, EventType>(create)
	);

	const { assign = ASSIGN, deps = [] } = options;

	const runningEffects = React.useRef<any[]>();
	const firstRender = React.useRef(true);
	const [curr, dispatch] = React.useReducer<
		ReducerType<ContextType, StateType, EventType>
	>(reducer, { context, machine, effects: null } as any, initial as any);
	const send: SendFunction<EventType> = React.useCallback(
		(event) => dispatch({ type: "send", event, machine }),
		[machine]
	);

	React.useEffect(() => {
		runningEffects.current = cleanEffects(runningEffects.current);

		if (curr.effects?.length) {
			runningEffects.current = runEffects(curr.effects, curr.state, send);
		}
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [send, curr.effects]);

	React.useEffect(() => {
		return () => {
			runningEffects.current = cleanEffects(runningEffects.current);
		};
	}, []);

	const assignEffectDeps: any[] = [send].concat(
		deps || (context ? Object.values(context) : [])
	);

	React.useEffect(() => {
		if (firstRender.current) {
			firstRender.current = false;
			return;
		}

		if (assign) {
			send({ type: assign, ...context } as any);
		}
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, assignEffectDeps);

	return [curr.state, send, curr.machine];
}

export default function useConstant<T>(fn: () => T): T {
	const ref = React.useRef<{ v: T }>();

	if (!ref.current) {
		ref.current = { v: fn() };
	}

	return ref.current.v;
}
