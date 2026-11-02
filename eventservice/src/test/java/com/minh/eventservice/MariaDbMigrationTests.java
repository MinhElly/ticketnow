package com.minh.eventservice;

import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import static org.junit.jupiter.api.Assertions.assertEquals;

/** Opt-in smoke check. The supplied URL MUST point at an isolated empty test database. */
@EnabledIfEnvironmentVariable(named = "MARIADB_MIGRATION_TEST_URL", matches = ".+")
@SpringBootTest(properties = {
        "spring.datasource.url=${MARIADB_MIGRATION_TEST_URL}",
        "spring.datasource.username=${MARIADB_MIGRATION_TEST_USERNAME:root}",
        "spring.datasource.password=${MARIADB_MIGRATION_TEST_PASSWORD}",
        "spring.jpa.hibernate.ddl-auto=validate"
})
class MariaDbMigrationTests {
    @Autowired
    private Flyway flyway;

    @Test
    void migrationAndHibernateValidationSucceedAndRestartIsNoOp() {
        assertEquals("1", flyway.info().current().getVersion().toString());
        assertEquals(0, flyway.migrate().migrationsExecuted);
    }
}
