import KnowgrphSpatialCore
import RealityKit
import simd

public enum KnowgrphRealityKitFlightFailure: String, Codable, Equatable, Sendable {
    case invalidFrameDelta
    case invalidModelStep
    case nonFiniteInput
    case nonFiniteState
    case nonFiniteResult
}

public struct KnowgrphFlightControlComponent: Component, Codable, Equatable, Sendable {
    public var input: FlightSimTickInput

    public init(input: FlightSimTickInput = .neutral) {
        self.input = input
    }
}

public struct KnowgrphFlightConfigurationComponent: Component, Codable, Equatable, Sendable {
    public var profile: FlightSimModelProfile

    public init(profile: FlightSimModelProfile = .default) {
        self.profile = profile
    }
}

public struct KnowgrphFlightStateComponent: Component, Codable, Equatable, Sendable {
    public var state: FlightSimAircraftState
    public var failure: KnowgrphRealityKitFlightFailure?

    public init(
        state: FlightSimAircraftState = .stationary,
        failure: KnowgrphRealityKitFlightFailure? = nil
    ) {
        self.state = state
        self.failure = failure
    }
}

public struct KnowgrphFlightAccumulatorComponent: Component, Codable, Equatable, Sendable {
    public var accumulator: FlightSimFixedStepAccumulator

    public init(accumulator: FlightSimFixedStepAccumulator = .default) {
        self.accumulator = accumulator
    }
}

public struct KnowgrphRealityKitFlightSystem: System {
    private static let query = EntityQuery(
        where: .has(KnowgrphFlightControlComponent.self)
            && .has(KnowgrphFlightConfigurationComponent.self)
            && .has(KnowgrphFlightStateComponent.self)
            && .has(KnowgrphFlightAccumulatorComponent.self)
    )

    @MainActor
    public init(scene: RealityKit.Scene) {}

    @MainActor
    public mutating func update(context: SceneUpdateContext) {
        for entity in context.entities(matching: Self.query, updatingSystemWhen: .rendering) {
            guard let control = entity.components[KnowgrphFlightControlComponent.self],
                  let configuration = entity.components[KnowgrphFlightConfigurationComponent.self],
                  var state = entity.components[KnowgrphFlightStateComponent.self],
                  var accumulator = entity.components[KnowgrphFlightAccumulatorComponent.self] else {
                continue
            }

            let stepCount: Int
            do {
                stepCount = try accumulator.accumulator.consume(
                    frameDeltaSeconds: context.deltaTime
                )
            } catch {
                state.failure = .invalidFrameDelta
                entity.components.set(state)
                continue
            }
            for _ in 0..<stepCount {
                do {
                    state.state = try integrateFlightModel(
                        previous: state.state,
                        inputValue: control.input,
                        stepSeconds: flightSimFixedStepSeconds,
                        profile: configuration.profile
                    )
                    state.failure = nil
                } catch is SpatialInputError {
                    state.failure = .nonFiniteInput
                    break
                } catch FlightSimModelError.nonFiniteState {
                    state.failure = .nonFiniteState
                    break
                } catch FlightSimModelError.nonFiniteResult {
                    state.failure = .nonFiniteResult
                    break
                } catch {
                    state.failure = .invalidModelStep
                    break
                }
            }

            entity.components.set(accumulator)
            entity.components.set(state)
            guard state.failure == nil, stepCount > 0 else { continue }
            apply(state.state, to: entity)
        }
    }

    @MainActor
    private func apply(_ state: FlightSimAircraftState, to entity: Entity) {
        entity.position = SIMD3(
            Float(state.position.x),
            Float(state.position.y),
            Float(state.position.z)
        )
        let yaw = simd_quatf(angle: Float(state.yaw), axis: [0, 1, 0])
        let pitch = simd_quatf(angle: Float(state.pitch), axis: [1, 0, 0])
        let roll = simd_quatf(angle: Float(state.roll), axis: [0, 0, 1])
        entity.orientation = simd_normalize(yaw * pitch * roll)
    }
}

@MainActor
public enum KnowgrphRealityKitFlightRegistration {
    private static let registration: Void = {
        KnowgrphFlightControlComponent.registerComponent()
        KnowgrphFlightConfigurationComponent.registerComponent()
        KnowgrphFlightStateComponent.registerComponent()
        KnowgrphFlightAccumulatorComponent.registerComponent()
        KnowgrphRealityKitFlightSystem.registerSystem()
    }()

    public static func ensureRegistered() {
        _ = registration
    }
}
