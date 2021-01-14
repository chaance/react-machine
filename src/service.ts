import { EventObject, MachineDescription, StateObject, Service } from "./types";
import {
	createMachine,
	transition,
	runEffects as run,
	cleanEffects as clean,
} from "./core";

export function createService<
	ContextType extends object,
	StateType extends StateObject<ContextType>,
	EventType extends EventObject
>(
	machineDescription: MachineDescription<ContextType, StateType, EventType>,
	context: ContextType = {} as ContextType
) {
	const machine = createMachine(machineDescription);

	const initialTransitionState: StateType = { name: null, context } as any;
	const initialTransitionEvent: EventType = { type: null } as any;

	// initial transition
	const [state, effects] = transition<ContextType, StateType, EventType>(
		machine,
		initialTransitionState,
		initialTransitionEvent
	);

	let cbs: ((...args: any) => any)[] = [];
	let running = true;

	const service: Service<ContextType, StateType, EventType> = {
		machine,
		state,
		prev: null,
		pendingEffects: effects || [],
		runningEffects: [],
		send(event) {
			if (!running) return;

			service.prev = service.state;
			const [state, effects] = transition(
				service.machine,
				service.state,
				event
			);
			service.state = state;
			if (effects) {
				service.pendingEffects = effects;
				runEffects();
			}

			for (const cb of cbs) {
				cb(state);
			}
		},
		subscribe(fn) {
			cbs.push(fn);
			return () => {
				cbs = cbs.filter((f) => f !== fn);
			};
		},
		stop() {
			running = false;
			cbs = [];
			service.pendingEffects = [];
			service.runningEffects = clean(service.runningEffects);
		},
	};

	function runEffects() {
		service.runningEffects = clean(service.runningEffects);
		service.runningEffects = run(
			service.pendingEffects,
			service.state,
			service.send
		);
	}

	runEffects();

	return service;
}
