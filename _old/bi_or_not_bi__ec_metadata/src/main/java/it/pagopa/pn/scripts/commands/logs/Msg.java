package it.pagopa.pn.scripts.commands.logs;

public class Msg {

    public static Msg fileListed( String fileName ) {
        Msg msg = new Msg();
        msg.msgType = MsgType.FILE_LISTED;
        msg.text = fileName;
        return msg;
    }

    public static Msg readFileStart( String fileName ) {
        Msg msg = new Msg();
        msg.msgType = MsgType.READ_FILE_START;
        msg.text = fileName;
        return msg;
    }

    public static Msg fileUploadStart( String fileName ) {
        Msg msg = new Msg();
        msg.msgType = MsgType.FILE_UPLOAD_START;
        msg.text = fileName;
        return msg;
    }

    public static Msg fileUploadEnd( String fileName ) {
        Msg msg = new Msg();
        msg.msgType = MsgType.FILE_UPLOAD_END;
        msg.text = fileName;
        return msg;
    }


    public static Msg jobScheduled( String jobName ) {
        Msg msg = new Msg();
        msg.msgType = MsgType.JOB_SCHEDULED;
        msg.text = jobName;
        return msg;
    }

    public static Msg jobStart( String jobName ) {
        Msg msg = new Msg();
        msg.msgType = MsgType.JOB_START;
        msg.text = jobName;
        return msg;
    }

    public static Msg jobDone( String jobName) {
        Msg msg = new Msg();
        msg.msgType = MsgType.JOB_DONE;
        msg.text = jobName;
        return msg;
    }

    public static Msg pollingForCapacity( int capacity ) {
        Msg msg = new Msg();
        msg.msgType = MsgType.CAPACITY_POLLING;
        msg.text = "" + capacity;
        return msg;
    }

    private MsgType msgType;

    public MsgType getMsgType() {
        return msgType;
    }

    private String text;

    public String getText() {
        return text;
    }

    enum MsgType {

        FILE_LISTED,
        READ_FILE_START,
        JOB_SCHEDULED,
        JOB_START,
        JOB_DONE,
        CAPACITY_POLLING,
        FILE_UPLOAD_START,
        FILE_UPLOAD_END;
    }

}
