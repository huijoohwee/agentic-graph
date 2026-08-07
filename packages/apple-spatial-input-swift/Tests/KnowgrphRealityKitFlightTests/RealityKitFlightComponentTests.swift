import KnowgrphRealityKitFlight
import KnowgrphSpatialCore
import XCTest

@MainActor
final class RealityKitFlightComponentTests: XCTestCase {
    func testPublicRegistrationAndComponentsUseCanonicalModels() {
        KnowgrphRealityKitFlightRegistration.ensureRegistered()

        let control = KnowgrphFlightControlComponent(
            input: FlightSimTickInput(pitch: 0.2, throttleDelta: 0.75)
        )
        let configuration = KnowgrphFlightConfigurationComponent()
        let state = KnowgrphFlightStateComponent()
        let accumulator = KnowgrphFlightAccumulatorComponent()

        XCTAssertEqual(control.input.throttleDelta, 0.75)
        XCTAssertEqual(configuration.profile, .default)
        XCTAssertEqual(state.state, FlightSimAircraftState.stationary)
        XCTAssertNil(state.failure)
        XCTAssertEqual(accumulator.accumulator.remainderSeconds, 0)
    }
}
