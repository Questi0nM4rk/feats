Feature: Feats self-test

  Scenario: Parse a feature file
    Given a feature source:
      """
      Feature: Hello
        Scenario: World
          Given something
      """
    When I parse the feature
    Then the feature name should be "Hello"
    And there should be 1 scenario

  Scenario: Register and match steps
    Given a step pattern "I have {int} items"
    When I match against "I have 5 items"
    Then the match should succeed with argument 5

  Scenario: Setup fixture project
    Given a fixture directory with a "config.json" file
    When I setup the fixture
    Then the fixture project should have "config.json"
    And cleanup should remove the temp directory
