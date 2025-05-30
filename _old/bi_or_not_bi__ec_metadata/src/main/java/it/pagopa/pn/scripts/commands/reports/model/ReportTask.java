package it.pagopa.pn.scripts.commands.reports.model;

import it.pagopa.pn.scripts.commands.enumerations.TaskEnum;

public class ReportTask {

    private String name;
    private TaskEnum type;
    private ReportTaskScript script;

    public String getName() {
        return name;
    }

    public void setName(String name) {
        this.name = name;
    }

    public TaskEnum getType() {
        return type;
    }

    public void setType(TaskEnum type) {
        this.type = type;
    }

    public ReportTaskScript getScript() {
        return script;
    }

    public void setScript(ReportTaskScript script) {
        this.script = script;
    }


    public static class ReportTaskScript {

        private String path;
        private String entry;

        public String getPath() {
            return path;
        }

        public void setPath(String path) {
            this.path = path;
        }

        public String getEntry() {
            return entry;
        }

        public void setEntry(String entry) {
            this.entry = entry;
        }
    }
}
