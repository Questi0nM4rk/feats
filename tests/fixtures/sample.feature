Feature: Sample feature

  Background:
    Given a setup step

  Scenario: Basic scenario
    Given a {string} value
    When I process it
    Then the result should be {int}

  Scenario Outline: Parameterized
    Given a "<name>" value
    When I multiply by <factor>
    Then the result should be <expected>

    Examples:
      | name  | factor | expected |
      | alpha | 2      | 10       |
      | beta  | 3      | 15       |
