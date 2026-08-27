import AgenticGraphRealityKitFlight
import AgenticGraphSpatialCore
import XCTest

@MainActor
final class RealityKitFlightComponentTests: XCTestCase {
    func testPublicRegistrationAndComponentsUseCanonicalModels() {
        AgenticGraphRealityKitFlightRegistration.ensureRegistered()

        let control = AgenticGraphFlightControlComponent(
            input: FlightSimTickInput(pitch: 0.2, throttleDelta: 0.75)
        )
        let configuration = AgenticGraphFlightConfigurationComponent()
        let state = AgenticGraphFlightStateComponent()
        let accumulator = AgenticGraphFlightAccumulatorComponent()

        XCTAssertEqual(control.input.throttleDelta, 0.75)
        XCTAssertEqual(configuration.profile, .default)
        XCTAssertEqual(state.state, FlightSimAircraftState.stationary)
        XCTAssertNil(state.failure)
        XCTAssertEqual(accumulator.accumulator.remainderSeconds, 0)
    }
}
