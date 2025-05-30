package it.pagopa.pn.scripts.commands.dag;

import it.pagopa.pn.scripts.commands.dag.model.SQLTask;
import it.pagopa.pn.scripts.commands.dag.model.Task;
import it.pagopa.pn.scripts.commands.enumerations.TaskEnum;
import org.testng.Assert;
import org.testng.annotations.Test;

public class TaskFactoryTest {

    @Test
    public void createSQLTaskTest() {

        // Given
        TaskEnum taskType = TaskEnum.SQL;

        // When
        Task task = TaskFactory.createTask(taskType);

        // Then
        Assert.assertNotNull(task);
        Assert.assertEquals(SQLTask.class, task.getClass());
    }

    @Test
    public void createNotAllowedTaskTest() {
        Assert.assertThrows(
            IllegalArgumentException.class,
            () -> TaskFactory.createTask(null)
        );
    }
}
